import {defineStore} from 'pinia'
import {ref} from 'vue'
import {inverseScramble, moveFace, buildMoveRemap} from '@/helpers/scramble_utils'
import {getKPuzzle} from '@/helpers/kpuzzle'
import {useDisplayStore} from '@/stores/DisplayStore'
import {useSettingsStore} from '@/stores/SettingsStore'

// Smart cube connection + case tracking, adapted from Algfolded
// (https://github.com/tobipch/algfolded). Only the "letter pair" style flow is
// kept: the virtual cube starts in the case's pre-alg state (the physical cube
// can be in any state — only relative moves are tracked), the first move
// starts the attempt, and reaching the case's solved state ends it.
//
// Besides the timing flow the store publishes every move it sees (lastMove /
// moveCounter), so other features — the cycle break trainer — can run their own
// virtual cube off the same connection.

export const useBluetoothCubeStore = defineStore('bluetoothCube', () => {
    const connected = ref(false)
    const deviceName = ref(null)
    const battery = ref(null)

    // 'idle'          : nothing to track
    // 'awaiting_solve': virtual cube is in the pre-alg state, waiting for the
    //                   first move of the attempt (timer not started yet)
    // 'solving'       : attempt running; reaching the solved state ends it
    const phase = ref('idle')

    // Paused: when true, incoming cube moves are ignored
    const paused = ref(false)

    // True when the cube is far from the target state and idle (likely a wrong
    // alg) — used to surface the "spin the bottom layer to reset" hint.
    const tooFarFromSolved = ref(false)
    // Bumped each time the user performs the reset gesture (a full 360° spin of
    // the bottom/top layer), so the UI can show a toast.
    const resetSignal = ref(0)

    // Set when an attempt finishes: duration + a counter the UI can watch.
    const lastSolveMs = ref(null)
    const solveCounter = ref(0)

    // Date.now() of the first move of the running attempt (null when not running)
    const attemptStartedAt = ref(null)

    // Every move the cube reports, already remapped to the user's orientation.
    // Published for features that track their own virtual cube; the counter is
    // what to watch, since the same move can come twice in a row.
    const lastMove = ref(null)
    const moveCounter = ref(0)

    // Internal (not exposed)
    let currentScramble = ''      // pre-alg state as a move string (inverse alg)
    let cube = null               // underlying brand-specific connection object
    let cubeDisconnect = null     // brand-specific disconnect fn
    let gattDevice = null         // BluetoothDevice for gattserverdisconnected listener
    let subscriptions = []        // active event subscriptions ({ unsubscribe() })
    let cubePattern = null
    let solvedPattern = null
    let startPattern = null       // pre-alg state, for "user undid everything" detection

    const finishSolve = () => {
        lastSolveMs.value = attemptStartedAt.value ? Date.now() - attemptStartedAt.value : null
        attemptStartedAt.value = null
        phase.value = 'idle'
        solveCounter.value++
    }

    // --- Reset gesture + "too far from solved" detection ---

    // Count how many edge/corner pieces (ignoring centers) are out of place
    // relative to solved.
    const piecesOff = (pattern) => {
        try {
            const a = pattern.patternData, b = solvedPattern.patternData
            let off = 0
            for (const orbit in a) {
                if (/CENTER/i.test(orbit)) continue
                const oa = a[orbit], ob = b[orbit]
                for (let i = 0; i < oa.pieces.length; i++) {
                    if (oa.pieces[i] !== ob.pieces[i] || (oa.orientation[i] ?? 0) !== (ob.orientation[i] ?? 0)) off++
                }
            }
            return off
        } catch (_) {
            return 99 // if we can't tell, assume far so the hint can still show
        }
    }

    const FAR_IDLE_MS = 2000      // idle time before flagging a likely wrong alg
    const FAR_PIECES_THRESHOLD = 4 // a comm leaves 3 pieces off; more = likely wrong
    let idleTimer = null
    const clearIdleTimer = () => { if (idleTimer) { clearTimeout(idleTimer); idleTimer = null } }

    // After each solving move, (re)arm an idle check. If the user stops with the
    // cube clearly off target, surface the reset hint.
    const scheduleFarCheck = () => {
        clearIdleTimer()
        idleTimer = setTimeout(() => {
            idleTimer = null
            if (phase.value === 'solving' && cubePattern && solvedPattern
                && !cubePattern.isIdentical(solvedPattern)
                && piecesOff(cubePattern) >= FAR_PIECES_THRESHOLD) {
                tooFarFromSolved.value = true
            }
        }, FAR_IDLE_MS)
    }

    // Detect a full 360° spin of the bottom (D) or top (U) layer used as a
    // "reset this attempt" gesture: e.g. D D D D, D' D' D' D', D2 D2 (or the
    // same with U). These are all net-identity, so they never appear in real
    // algs. The buffer only ever holds moves of a single face — switching faces
    // (D→U or vice versa) starts over.
    let resetGestureMoves = []
    const checkResetGesture = (move) => {
        const face = moveFace(move)
        if (face !== 'D' && face !== 'U') { resetGestureMoves = []; return false }
        if (resetGestureMoves.length > 0 && moveFace(resetGestureMoves[0]) !== face) {
            resetGestureMoves = []
        }
        resetGestureMoves.push(move)
        if (resetGestureMoves.length > 4) resetGestureMoves = resetGestureMoves.slice(-4)
        const last4 = resetGestureMoves.slice(-4)
        if (last4.length === 4 && (last4.every(m => m === face) || last4.every(m => m === face + "'"))) return true
        const last2 = resetGestureMoves.slice(-2)
        if (last2.length === 2 && last2.every(m => m === face + '2')) return true
        return false
    }

    // An unexpected drop (device powered off / out of range / the OS tearing
    // the link down when the page is backgrounded). Guard so it runs once.
    const onGattDisconnect = () => {
        if (!connected.value) return
        const display = useDisplayStore()
        cleanupConnection()
        display.showToast('Smartcube-Verbindung verloren — zum Neuverbinden aufs Bluetooth-Icon tippen', 'danger')
    }

    // --- Connection liveness -------------------------------------------------
    // On mobile the OS can tear down the GATT link (e.g. during an app switch)
    // without always delivering the 'gattserverdisconnected' event. `gatt.connected`
    // is unreliable on iOS, so only several CONSECUTIVE dead readings count, and
    // never during a grace period after connecting.
    let livenessTimer = null
    let deadReadings = 0
    let monitorArmedAt = 0
    const gattIsLive = () => !!(gattDevice && gattDevice.gatt && gattDevice.gatt.connected)
    const checkLiveness = () => {
        if (!connected.value || !gattDevice) { deadReadings = 0; return }
        if (Date.now() - monitorArmedAt < 8000) return // settle after connect
        deadReadings = gattIsLive() ? 0 : deadReadings + 1
        if (deadReadings >= 3) { deadReadings = 0; onGattDisconnect() }
    }
    const startLivenessMonitor = () => {
        stopLivenessMonitor()
        deadReadings = 0
        monitorArmedAt = Date.now()
        livenessTimer = setInterval(checkLiveness, 3000)
    }
    const stopLivenessMonitor = () => {
        if (livenessTimer) { clearInterval(livenessTimer); livenessTimer = null }
        deadReadings = 0
    }

    // GAN cubes derive their encryption key from the device MAC address. The
    // library auto-detects it from the BLE advertisement when possible; if that
    // fails it calls this provider as a last resort, where we ask the user.
    const ganMacProvider = async (device, isFallbackCall) => {
        if (!isFallbackCall) return null // let the library try auto-detection first
        const mac = window.prompt(
            'GAN-Cube MAC-Adresse eingeben (z.B. AB:CD:EF:12:34:56).\n' +
            'Zu finden in der GAN / Cube Station App.'
        )
        const trimmed = (mac || '').trim()
        return /^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/.test(trimmed) ? trimmed : null
    }

    // Connect a MoYu / QiYi cube via btcube-web.
    const connectMoyu = async (display) => {
        const {connectSmartCube} = await import('btcube-web')
        patchRequestDevice()
        const c = await connectSmartCube()
        cube = c
        cubeDisconnect = () => { try { c.commands.disconnect() } catch (_) {} }
        connected.value = true
        deviceName.value = c.device?.name || 'Smart Cube'
        subscriptions.push(c.events.moves.subscribe(event => onMove(event.move)))
        subscriptions.push(c.events.info.subscribe(event => {
            if ('battery' in event) battery.value = event.battery
        }))
        gattDevice = c.device || null
        gattDevice?.addEventListener('gattserverdisconnected', onGattDisconnect)
        startLivenessMonitor()
        display.showToast('Verbunden mit ' + deviceName.value, 'success')
    }

    // Web Bluetooth on non-Chromium browsers (notably Bluefy on iOS) is fussy
    // about requestDevice options in ways the cube libraries trip over. Rewrite
    // every request to acceptAllDevices with all services reachable; the user
    // picks the cube manually and the libraries match it by name as before.

    // Warm the (large) cube-library chunks ahead of time. Called when the user
    // opens the connect menu, so requestDevice fires promptly within the click
    // gesture when they pick a brand.
    let libsWarmed = false
    const warmupLibraries = () => {
        if (libsWarmed) return
        libsWarmed = true
        import('btcube-web').catch(() => { libsWarmed = false })
        import('gan-web-bluetooth').catch(() => { libsWarmed = false })
    }

    // BLE 16/32-bit numeric UUID -> canonical 128-bit string form.
    const canonicalUuid = (u) =>
        typeof u === 'number'
            ? '0000' + (u >>> 0).toString(16).padStart(4, '0') + '-0000-1000-8000-00805f9b34fb'
            : u

    // Every service UUID mentioned anywhere in a requestDevice options object.
    const collectServices = (options) => {
        const out = new Set()
        for (const f of options.filters || []) {
            for (const s of f.services || []) out.add(canonicalUuid(s))
        }
        for (const s of options.optionalServices || []) out.add(canonicalUuid(s))
        return [...out]
    }

    const permissiveOptions = (options) => ({
        acceptAllDevices: true,
        optionalServices: collectServices(options),
    })

    const wrapRequestDevice = (original) => async (options) => {
        if (!options) return await original(options)
        return await original(permissiveOptions(options))
    }

    // Install the wrapper once. Some browsers expose navigator.bluetooth as
    // read-only, so fall back from plain assignment to defineProperty on the
    // bluetooth object, then to shadowing navigator.bluetooth.
    let requestDevicePatched = false
    const patchRequestDevice = () => {
        if (requestDevicePatched || !navigator.bluetooth) return
        const bt = navigator.bluetooth
        const wrapped = wrapRequestDevice(bt.requestDevice.bind(bt))
        try { bt.requestDevice = wrapped } catch (_) { /* try harder below */ }
        if (bt.requestDevice !== wrapped) {
            try {
                Object.defineProperty(bt, 'requestDevice', {value: wrapped, configurable: true})
            } catch (_) { /* try harder below */ }
        }
        if (bt.requestDevice !== wrapped) {
            try {
                const shadow = {requestDevice: wrapped}
                for (const k in bt) {
                    if (k === 'requestDevice') continue
                    const v = bt[k]
                    shadow[k] = typeof v === 'function' ? v.bind(bt) : v
                }
                Object.defineProperty(navigator, 'bluetooth', {value: shadow, configurable: true})
            } catch (_) { /* proceed unwrapped: original behaviour */ }
        }
        requestDevicePatched = true
    }

    // Connect a GAN cube via gan-web-bluetooth.
    const connectGan = async (display) => {
        const {connectGanCube} = await import('gan-web-bluetooth')
        patchRequestDevice()
        const conn = await connectGanCube(ganMacProvider)
        cube = conn
        cubeDisconnect = () => { try { conn.disconnect() } catch (_) {} }
        connected.value = true
        deviceName.value = conn.deviceName || 'GAN Smart Cube'
        gattDevice = conn.device || null
        subscriptions.push(conn.events$.subscribe(event => {
            if (event.type === 'MOVE') {
                onMove(event.move)
            } else if (event.type === 'BATTERY') {
                battery.value = event.batteryLevel
            } else if (event.type === 'DISCONNECT') {
                onGattDisconnect()
            }
        }))
        startLivenessMonitor()
        try { await conn.sendCubeCommand({type: 'REQUEST_HARDWARE'}) } catch (_) {}
        try { await conn.sendCubeCommand({type: 'REQUEST_BATTERY'}) } catch (_) {}
        display.showToast('Verbunden mit ' + deviceName.value, 'success')
    }

    const connect = async (brand = 'moyu') => {
        const display = useDisplayStore()
        try {
            if (!navigator.bluetooth) {
                display.showToast('Bluetooth wird von diesem Browser nicht unterstützt', 'danger')
                return
            }
            if (brand === 'gan') {
                await connectGan(display)
            } else {
                await connectMoyu(display)
            }
        } catch (e) {
            console.error('Bluetooth connect failed:', e)
            cleanupConnection()
            if (e?.name === 'NotFoundError') {
                display.showToast('Kein Smartcube gefunden. Ist der Cube an und in der Nähe?', 'danger')
            } else {
                const detail = [e?.name, e?.message].filter(Boolean).join(': ') || 'Unknown error'
                display.showToast('Verbindung fehlgeschlagen: ' + detail, 'danger')
            }
        }
    }

    const disconnect = () => {
        const display = useDisplayStore()
        if (keyboardListener) {
            disconnectKeyboard()
            display.showToast('Keyboard-Simulator getrennt', 'info')
            return
        }
        if (cubeDisconnect) cubeDisconnect()
        cleanupConnection()
        display.showToast('Smartcube getrennt', 'info')
    }

    const cleanupConnection = () => {
        stopLivenessMonitor()
        for (const s of subscriptions) { try { s.unsubscribe() } catch (_) {} }
        subscriptions = []
        if (gattDevice) {
            try { gattDevice.removeEventListener('gattserverdisconnected', onGattDisconnect) } catch (_) {}
            gattDevice = null
        }
        cube = null
        cubeDisconnect = null
        connected.value = false
        deviceName.value = null
        battery.value = null
        resetTracking()
    }

    // Set the virtual cube to the case's pre-alg state (scramble = inverse of
    // the alg applied to solved). The physical cube can be in any state — only
    // relative moves are tracked.
    const initVirtualState = (kpuzzle) => {
        solvedPattern = kpuzzle.defaultPattern()
        tooFarFromSolved.value = false
        resetGestureMoves = []
        attemptStartedAt.value = null
        clearIdleTimer()

        let p = solvedPattern
        for (const m of currentScramble.split(' ').filter(m => m.length > 0)) {
            try { p = p.applyMove(m) } catch (_) {}
        }
        cubePattern = p
        startPattern = p
        phase.value = currentScramble ? 'awaiting_solve' : 'idle'
    }

    // Arm tracking for an alg (a plain move string). Each attempt of the case
    // re-arms with the same alg.
    const startTracking = async (algMoveString) => {
        if (!algMoveString) return
        currentScramble = inverseScramble(algMoveString)
        const kpuzzle = await getKPuzzle()
        initVirtualState(kpuzzle)
    }

    const resetTracking = () => {
        phase.value = 'idle'
        paused.value = false
        tooFarFromSolved.value = false
        resetGestureMoves = []
        attemptStartedAt.value = null
        clearIdleTimer()
        currentScramble = ''
        cubePattern = null
        solvedPattern = null
        startPattern = null
    }

    const pauseTracking = () => { paused.value = true }
    const resumeTracking = () => { paused.value = false }

    // Re-arm tracking for the current case from the beginning. Useful after the
    // user did random moves (e.g. while paused) or messed up an attempt.
    const resetToStart = async () => {
        if (!currentScramble) return
        const kpuzzle = await getKPuzzle()
        paused.value = false
        initVirtualState(kpuzzle)
    }

    const onMove = (rawMove) => {
        // Remap move based on cube orientation setting
        const settings = useSettingsStore()
        const remap = buildMoveRemap(settings.store.cubeOrientation)
        const move = remap ? remap(rawMove) : rawMove

        // Publish first: pausing only concerns the timing flow below, other
        // features stay in sync with the physical cube either way.
        lastMove.value = move
        moveCounter.value++

        if (paused.value) return

        if (cubePattern) {
            try { cubePattern = cubePattern.applyMove(move) } catch (_) {}
        }

        // Reset gesture: a full 360° spin of the bottom/top layer re-arms the
        // attempt. It's net-identity, so the cube state is unchanged before the
        // re-init.
        if (checkResetGesture(move)) {
            resetGestureMoves = []
            resetSignal.value++
            resetToStart()
            return
        }

        if (phase.value === 'awaiting_solve') {
            // First move of the attempt: the timer starts here. Immediately
            // check the (degenerate) case where one move already solves it.
            phase.value = 'solving'
            attemptStartedAt.value = Date.now()
            if (cubePattern && solvedPattern && cubePattern.isIdentical(solvedPattern)) {
                finishSolve()
            }
        } else if (phase.value === 'solving') {
            if (cubePattern && solvedPattern && cubePattern.isIdentical(solvedPattern)) {
                finishSolve()
            } else if (startPattern && cubePattern && cubePattern.isIdentical(startPattern)) {
                // The user undid their mistakes all the way back to the case's
                // start position: restart the attempt — the next move re-starts
                // the timer.
                attemptStartedAt.value = null
                phase.value = 'awaiting_solve'
            }
        }

        // Refresh the "too far from solved" hint: any move clears it and
        // re-arms the idle check.
        tooFarFromSolved.value = false
        if (phase.value === 'solving') scheduleFarCheck()
    }

    // Keyboard simulator for testing without a real cube
    let keyboardListener = null

    const connectKeyboard = () => {
        if (keyboardListener) return
        connected.value = true
        deviceName.value = 'Keyboard Simulator'
        battery.value = 100

        const keyMap = {
            'r': 'R', 'l': 'L', 'u': 'U', 'd': 'D', 'f': 'F', 'b': 'B',
            'R': "R'", 'L': "L'", 'U': "U'", 'D': "D'", 'F': "F'", 'B': "B'",
        }

        keyboardListener = (e) => {
            let move = null
            const lower = e.key.toLowerCase()
            if (e.ctrlKey && 'rludfb'.includes(lower)) {
                move = lower.toUpperCase() + '2'
            } else {
                move = keyMap[e.key]
            }
            if (move && (phase.value === 'awaiting_solve' || phase.value === 'solving')) {
                e.preventDefault()
                e.stopPropagation()
                onMove(move)
            }
        }
        window.addEventListener('keydown', keyboardListener, true) // capture phase
        console.log(
            '%cKeyboard cube simulator active!',
            'color: #0d6efd; font-weight: bold',
            '\n  r/l/u/d/f/b = clockwise',
            '\n  R/L/U/D/F/B (shift) = prime',
            '\n  Ctrl+r/l/u/d/f/b = double (R2, L2, ...)',
            '\n  Disconnect: window.btSim.disconnect()'
        )
    }

    const disconnectKeyboard = () => {
        if (keyboardListener) {
            window.removeEventListener('keydown', keyboardListener, true)
            keyboardListener = null
        }
        connected.value = false
        deviceName.value = null
        battery.value = null
        resetTracking()
    }

    // Expose internals for btSim (set up after store return)
    const _getInternals = () => ({ connectKeyboard, disconnectKeyboard, onMove })

    return {
        connected, deviceName, battery,
        phase, paused, tooFarFromSolved, resetSignal,
        lastMove, moveCounter,
        lastSolveMs, solveCounter, attemptStartedAt, warmupLibraries,
        connect, disconnect, startTracking, resetTracking,
        pauseTracking, resumeTracking, resetToStart, _getInternals
    }
})

// Expose keyboard simulator on window at module load time (no store instantiation needed)
if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'btSim', {
        get() {
            const store = useBluetoothCubeStore()
            const { connectKeyboard, disconnectKeyboard, onMove } = store._getInternals()
            return {
                connect: connectKeyboard,
                disconnect: disconnectKeyboard,
                move: (m) => onMove(m),
            }
        },
        configurable: true
    })
}
