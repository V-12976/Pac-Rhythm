const canvas = document.getElementById("gameCanvas")
const ctx = canvas.getContext("2d")
const statusText = document.getElementById("statusText")
const scoreValue = document.getElementById("scoreValue")
const comboValue = document.getElementById("comboValue")
const pelletValue = document.getElementById("pelletValue")
const lifeValue = document.getElementById("lifeValue")
const powerValue = document.getElementById("powerValue")

const startButton = document.getElementById("startButton")
const pauseButton = document.getElementById("pauseButton")
const resetButton = document.getElementById("resetButton")
const bpmInput = document.getElementById("bpmInput")
const chartArea = document.getElementById("chartArea")
const songNameInput = document.getElementById("songNameInput")
const saveSongButton = document.getElementById("saveSongButton")
const songSelect = document.getElementById("songSelect")
const loadSongButton = document.getElementById("loadSongButton")
const newSongButton = document.getElementById("newSongButton")
const songList = document.getElementById("songList")
const launchGameButton = document.getElementById("launchGameButton")
const selectedSongTitle = document.getElementById("selectedSongTitle")
const selectedSongMeta = document.getElementById("selectedSongMeta")
const playingTitle = document.getElementById("playingTitle")
const playingMeta = document.getElementById("playingMeta")
const primaryStart = document.getElementById("primaryStart")
const primaryEditor = document.getElementById("primaryEditor")
const openEditorFromSetup = document.getElementById("openEditorFromSetup")
const playAudioButton = document.getElementById("playAudioButton")
const stopAudioButton = document.getElementById("stopAudioButton")
const toolSelect = document.getElementById("toolSelect")
const bpmStatus = document.getElementById("bpmStatus")
const recordCanvas = document.getElementById("recordCanvas")
const editorCanvas = document.getElementById("editorCanvas")
const audioInput = document.getElementById("audioInput")
const audioName = document.getElementById("audioName")
const cameraSelect = document.getElementById("cameraSelect")
const gestureStartToggle = document.getElementById("gestureStartToggle")
const poseStatus = document.getElementById("poseStatus")
const refreshCameraButton = document.getElementById("refreshCameraButton")
const poseVideo = document.getElementById("poseVideo")
const poseCanvas = document.getElementById("poseCanvas")
const gameOverModal = document.getElementById("gameOverModal")
const gameOverTitle = document.getElementById("gameOverTitle")
const gameOverReason = document.getElementById("gameOverReason")
const gameOverScore = document.getElementById("gameOverScore")
const restartButton = document.getElementById("restartButton")
const backToEditorButton = document.getElementById("backToEditorButton")
const difficultySelect = document.getElementById("difficultySelect")
const autoGenerateButton = document.getElementById("autoGenerateButton")

const lanes = 3
const pacmanX = 160
const laneHeight = 100
const pacmanRadius = 26
const leadTime = 2000
const hitWindow = 26
const maxLives = 3
const invincibleDuration = 3000
const powerDuration = 10000
const storageKey = "poserhythmSongs"
const dbName = "pac-rhythm-db"
const storeName = "songs"
const metaStoreName = "songMeta"
const isFileProtocol = location.protocol === "file:"
const timelinePadding = 70
const timelineLaneHeight = 60
const timelineTop = 40
const timelineHeight = 220
const pxPerSecond = 120

let bpm = 120
let beatMs = 60000 / bpm
let editorItems = []
let recordPath = []
let objects = []
let score = 0
let combo = 0
let pellets = 0
let lives = maxLives
let gameState = "idle"
let startTime = 0
let pausedAt = 0
let invincibleUntil = 0
let powerUntil = 0
let songs = []
let selectedSongId = null
let currentSong = null
let activeViewId = "homeView"
let editorSongId = null
let recording = false
let recordingPaused = false
let recordStartTime = 0
let recordLastSample = 0
let recordPausedElapsed = 0
let recordTotalPauseDuration = 0
let recordPauseStartTime = 0
let editorDurationMs = 30000
let editorAudioDataUrl = null
let editorAudioName = "未选择音频"
let audioOffsetMs = 0
let pose
let poseCamera
let poseStream
let poseLane = 1
let poseCandidateLane = null
let poseCandidateAt = 0
let gestureStartEnabled = false
let gestureHoldStart = 0
let gestureHoldSeconds = 0
let poseLineTop = 0.35
let poseLineBottom = 0.65
let poseDragging = null
let lastPoseSendAt = 0

// Editor timeline draggable cursor
let editorCursorMs = 0
let editorCursorDragging = false
let editorPreviewPlaying = false
let editorPreviewStartTime = 0

let audioContext
let audioBuffer = null
let audioSource = null
let dbPromise

const pacman = {
  lane: 1,
  targetLane: 1,
  y: laneToY(1),
  mouth: 0,
  mouthSpeed: 0.12
}

const toolState = {
  active: "pellet"
}

const particles = []
const shockwaves = []
const comboPopups = []
let screenShake = 0
let screenShakeIntensity = 0

function laneToY(lane) {
  return 60 + lane * laneHeight
}

function timelineLaneY(lane) {
  return timelineTop + lane * timelineLaneHeight
}

function setStatus(text) {
  statusText.textContent = text
}

function updateHud(now = performance.now()) {
  scoreValue.textContent = score
  comboValue.textContent = combo
  pelletValue.textContent = pellets
  lifeValue.textContent = "❤".repeat(lives) + "♡".repeat(maxLives - lives)
  const remaining = Math.max(0, Math.ceil((powerUntil - now) / 1000))
  powerValue.textContent = remaining > 0 ? `${remaining}s` : "无"
}

function setupPose() {
  if (typeof Pose === "undefined") {
    console.error("[Pose] Pose 类未定义。lib/mediapipe/pose.js 可能未加载。")
    poseStatus.textContent = "⚠ 体感库未加载，请检查 lib/mediapipe/ 文件"
    return
  }
  if (typeof Camera === "undefined") {
    console.error("[Pose] Camera 类未定义。lib/mediapipe/camera_utils.js 可能未加载。")
    poseStatus.textContent = "⚠ 摄像头库未加载，请检查 lib/mediapipe/ 文件"
    return
  }
  try {
    pose = new Pose({
      locateFile: (file) => `lib/mediapipe/pose/${file}`
    })
    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6
    })
    pose.onResults(onPoseResults)
    console.log("[Pose] MediaPipe Pose 初始化成功 (本地文件)")
  } catch (error) {
    console.error("[Pose] 初始化失败:", error)
    poseStatus.textContent = "⚠ 体感初始化失败: " + error.message
  }
}

// 摄像头枚举与选择，支持多设备切换
async function enumerateCameras() {
  // Check if browser supports camera API
  if (!navigator.mediaDevices?.enumerateDevices) {
    cameraSelect.innerHTML = ""
    const option = document.createElement("option")
    option.value = ""
    if (!window.isSecureContext) {
      option.textContent = "⚠ 需要安全上下文 (localhost 或 https)"
      poseStatus.textContent = "请用 localhost:" + location.port + " 访问"
      console.warn("[Camera] 不安全上下文，摄像头API不可用")
    } else {
      option.textContent = "摄像头API不可用"
      poseStatus.textContent = "浏览器不支持摄像头API"
    }
    cameraSelect.appendChild(option)
    return
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const cameras = devices.filter((device) => device.kind === "videoinput")
    cameraSelect.innerHTML = ""
    if (cameras.length === 0) {
      const option = document.createElement("option")
      option.value = ""
      option.textContent = "未检测到摄像头"
      cameraSelect.appendChild(option)
      poseStatus.textContent = "未检测到摄像头"
      return
    }
    cameras.forEach((camera, index) => {
      const option = document.createElement("option")
      option.value = camera.deviceId
      option.textContent = camera.label || `摄像头 ${index + 1}`
      cameraSelect.appendChild(option)
    })
    if (!cameraSelect.value && cameras[0]) {
      cameraSelect.value = cameras[0].deviceId
    }
  } catch (error) {
    console.warn("摄像头枚举失败:", error)
    cameraSelect.innerHTML = ""
    const option = document.createElement("option")
    option.value = ""
    option.textContent = "摄像头访问失败"
    cameraSelect.appendChild(option)
    poseStatus.textContent = "摄像头访问失败"
  }
}

// 绑定指定摄像头到 MediaPipe 处理链
async function startPoseCamera(deviceId) {
  if (!navigator.mediaDevices?.getUserMedia) {
    poseStatus.textContent = "摄像头API不可用，请检查浏览器设置"
    return
  }
  if (!pose) {
    poseStatus.textContent = "⚠ 体感库未加载，请检查网络并刷新"
    return
  }
  try {
    if (poseStream) {
      poseStream.getTracks().forEach((track) => track.stop())
    }
    const constraints = deviceId ? { video: { deviceId: { exact: deviceId } } } : { video: true }
    poseStream = await navigator.mediaDevices.getUserMedia(constraints)
    poseVideo.srcObject = poseStream
    await poseVideo.play()
    if (poseCamera) {
      poseCamera.stop()
    }
    lastPoseSendAt = 0
    poseCamera = new Camera(poseVideo, {
      onFrame: async () => {
        const now = performance.now()
        if (now - lastPoseSendAt < 33) return
        lastPoseSendAt = now
        await pose.send({ image: poseVideo })
      },
      width: 640,
      height: 360
    })
    poseCamera.start()
    poseStatus.textContent = "摄像头已连接"
  } catch (error) {
    console.warn("摄像头启动失败:", error)
    if (error.name === "NotAllowedError") {
      poseStatus.textContent = "摄像头权限被拒绝，请在浏览器设置中允许"
    } else if (error.name === "NotFoundError") {
      poseStatus.textContent = "未找到摄像头设备"
    } else {
      poseStatus.textContent = "摄像头不可用: " + error.message
    }
  }
}

// 轨道判定：手腕相对肩/髋的位置决定上/中/下
function determinePoseLane(landmarks) {
  const leftWrist = landmarks[15]
  const rightWrist = landmarks[16]
  const leftShoulder = landmarks[11]
  const rightShoulder = landmarks[12]
  if (
    leftWrist.visibility < 0.5 ||
    rightWrist.visibility < 0.5 ||
    leftShoulder.visibility < 0.4 ||
    rightShoulder.visibility < 0.4
  ) {
    return null
  }
  const wristY = (leftWrist.y + rightWrist.y) * 0.5
  if (wristY < poseLineTop) return 0
  if (wristY > poseLineBottom) return 2
  return 1
}

function applyPoseLane(lane) {
  const now = performance.now()
  if (lane === null) return
  if (lane !== poseLane) {
    if (poseCandidateLane !== lane) {
      poseCandidateLane = lane
      poseCandidateAt = now
    } else if (now - poseCandidateAt > 120) {
      poseLane = lane
      poseCandidateLane = null
    }
  } else {
    poseCandidateLane = null
  }
  if (activeViewId === "gameView" || (activeViewId === "editorView" && recording)) {
    pacman.targetLane = poseLane
  }
}

function isHandsUp(landmarks) {
  const leftWrist = landmarks[15]
  const rightWrist = landmarks[16]
  const leftShoulder = landmarks[11]
  const rightShoulder = landmarks[12]
  if (
    leftWrist.visibility < 0.5 ||
    rightWrist.visibility < 0.5 ||
    leftShoulder.visibility < 0.4 ||
    rightShoulder.visibility < 0.4
  ) {
    return false
  }
  const wristY = (leftWrist.y + rightWrist.y) * 0.5
  return wristY < poseLineTop
}

function updateGestureStart(landmarks) {
  if (!gestureStartEnabled || activeViewId !== "gameView") {
    gestureHoldStart = 0
    gestureHoldSeconds = 0
    poseStatus.textContent = gestureStartEnabled ? "手势：待机" : "手势：关闭"
    return
  }
  if (!landmarks || gameState !== "idle") {
    poseStatus.textContent = "手势：待机"
    gestureHoldStart = 0
    gestureHoldSeconds = 0
    return
  }
  if (isHandsUp(landmarks)) {
    if (!gestureHoldStart) {
      gestureHoldStart = performance.now()
    }
    gestureHoldSeconds = (performance.now() - gestureHoldStart) / 1000
    poseStatus.textContent = `手势：准备 ${gestureHoldSeconds.toFixed(1)}s`
    if (gestureHoldSeconds >= 2) {
      poseStatus.textContent = "手势：已触发"
      gestureHoldStart = 0
      gestureHoldSeconds = 0
      startGame()
    }
  } else {
    poseStatus.textContent = "手势：待机"
    gestureHoldStart = 0
    gestureHoldSeconds = 0
  }
}

function clampPoseLines() {
  poseLineTop = Math.max(0.1, Math.min(0.9, poseLineTop))
  poseLineBottom = Math.max(0.1, Math.min(0.9, poseLineBottom))
  if (poseLineBottom - poseLineTop < 0.1) {
    poseLineBottom = poseLineTop + 0.1
  }
  if (poseLineBottom > 0.95) {
    poseLineBottom = 0.95
    poseLineTop = Math.min(poseLineTop, 0.85)
  }
}

function updatePoseLineByPointer(event) {
  const rect = poseCanvas.getBoundingClientRect()
  const y = (event.clientY - rect.top) / rect.height
  if (poseDragging === "top") {
    poseLineTop = Math.min(y, poseLineBottom - 0.1)
  } else if (poseDragging === "bottom") {
    poseLineBottom = Math.max(y, poseLineTop + 0.1)
  }
  clampPoseLines()
}

function drawPoseLines(poseCtx, width, height) {
  const topY = poseLineTop * height
  const bottomY = poseLineBottom * height
  poseCtx.strokeStyle = "rgba(255, 255, 255, 0.6)"
  poseCtx.lineWidth = 2
  poseCtx.beginPath()
  poseCtx.moveTo(0, topY)
  poseCtx.lineTo(width, topY)
  poseCtx.moveTo(0, bottomY)
  poseCtx.lineTo(width, bottomY)
  poseCtx.stroke()
}

// 绘制体感骨架并触发轨道与手势逻辑
function onPoseResults(results) {
  if (!poseCanvas || !poseVideo) return
  const width = poseVideo.videoWidth || 640
  const height = poseVideo.videoHeight || 360
  poseCanvas.width = width
  poseCanvas.height = height
  const poseCtx = poseCanvas.getContext("2d")
  poseCtx.save()
  poseCtx.setTransform(1, 0, 0, 1, 0, 0)
  poseCtx.clearRect(0, 0, width, height)
  poseCtx.translate(width, 0)
  poseCtx.scale(-1, 1)
  poseCtx.drawImage(results.image, 0, 0, width, height)
  if (results.poseLandmarks) {
    drawConnectors(poseCtx, results.poseLandmarks, POSE_CONNECTIONS, {
      color: "rgba(126, 242, 255, 0.6)",
      lineWidth: 2
    })
    drawLandmarks(poseCtx, results.poseLandmarks, {
      color: "rgba(255, 255, 255, 0.8)",
      radius: 3
    })
    const lane = determinePoseLane(results.poseLandmarks)
    applyPoseLane(lane)
    updateGestureStart(results.poseLandmarks)
  } else {
    updateGestureStart(null)
  }
  drawPoseLines(poseCtx, width, height)
  poseCtx.restore()
}

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)()
  }
  return audioContext
}

// IndexedDB 作为统一存储后端（http 与 file 协议一致）
function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 2)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: "id" })
      }
      if (!db.objectStoreNames.contains(metaStoreName)) {
        db.createObjectStore(metaStoreName, { keyPath: "id" })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

async function getAllSongs() {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly")
    const store = transaction.objectStore(storeName)
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)
  })
}

async function putSong(song) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite")
    const store = transaction.objectStore(storeName)
    const request = store.put(song)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

async function putSongMeta(songId, meta) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(metaStoreName, "readwrite")
    const store = transaction.objectStore(metaStoreName)
    const request = store.put({ id: songId, ...meta })
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

async function getSongMeta(songId) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(metaStoreName, "readonly")
    const store = transaction.objectStore(metaStoreName)
    const request = store.get(songId)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  })
}

async function getAllSongMeta() {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(metaStoreName, "readonly")
    const store = transaction.objectStore(metaStoreName)
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)
  })
}

async function deleteSongById(songId) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite")
    const store = transaction.objectStore(storeName)
    const request = store.delete(songId)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

// file:// 环境下使用 OPFS 保存 songs.json，解决浏览器本地文件访问限制
async function getFileDirectory() {
  if (!navigator.storage?.getDirectory || !isFileProtocol) return null
  return navigator.storage.getDirectory()
}

async function readSongsFromFileSystem() {
  const directory = await getFileDirectory()
  if (!directory) return null
  try {
    const handle = await directory.getFileHandle("songs.json")
    const file = await handle.getFile()
    const text = await file.text()
    return JSON.parse(text)
  } catch (error) {
    return null
  }
}

async function writeSongsToFileSystem(list) {
  const directory = await getFileDirectory()
  if (!directory) return
  const handle = await directory.getFileHandle("songs.json", { create: true })
  const writable = await handle.createWritable()
  await writable.write(JSON.stringify(list))
  await writable.close()
}

// 从 songs/ 文件夹加载曲谱包（需 HTTP 服务器环境）
async function loadFolderPacks() {
  if (isFileProtocol) {
    console.log("[曲谱包] 跳过：file:// 协议不支持")
    return []
  }
  try {
    const cacheBuster = `?_=${Date.now()}`
    const response = await fetch("songs/index.json" + cacheBuster)
    if (!response.ok) {
      console.warn("[曲谱包] index.json 加载失败:", response.status)
      return []
    }
    const index = await response.json()
    console.log("[曲谱包] index.json 内容:", index)
    if (!Array.isArray(index.packs)) {
      console.warn("[曲谱包] index.json 中没有 packs 数组")
      return []
    }
    const folderSongs = []
    for (const pack of index.packs) {
      try {
        console.log(`[曲谱包] 正在加载: ${pack.folder}`)
        const chartResponse = await fetch(`songs/${pack.folder}/chart.json` + cacheBuster)
        if (!chartResponse.ok) {
          console.warn(`[曲谱包] ${pack.folder}/chart.json 加载失败:`, chartResponse.status)
          continue
        }
        const chart = await chartResponse.json()
        const audioUrl = pack.audio ? `songs/${pack.folder}/${pack.audio}` : null
        folderSongs.push({
          id: `folder:${pack.folder}`,
          name: chart.name || pack.folder,
          artist: chart.artist || "",
          album: chart.album || "",
          coverDataUrl: chart.cover ? `songs/${pack.folder}/${chart.cover}` : null,
          bpm: chart.bpm || 120,
          durationMs: chart.durationMs || 30000,
          items: Array.isArray(chart.items) ? chart.items : [],
          recordPath: Array.isArray(chart.recordPath) ? chart.recordPath : [],
          audioDataUrl: audioUrl,
          audioName: pack.audio || "",
          source: "folder",
          folder: pack.folder
        })
        console.log(`[曲谱包] ✅ ${chart.name || pack.folder} 加载成功`)
      } catch (error) {
        console.warn(`曲谱包 ${pack.folder} 加载失败:`, error)
      }
    }
    console.log(`[曲谱包] 共加载 ${folderSongs.length} 个曲谱包`)
    return folderSongs
  } catch (error) {
    console.error("[曲谱包] 加载异常:", error)
    return []
  }
}

function stopAudio() {
  if (audioSource) {
    audioSource.stop()
    audioSource.disconnect()
    audioSource = null
  }
}

// Web Audio 预览播放，供编辑器与游戏共用
function playAudio(offsetMs = 0) {
  if (!audioBuffer) return
  stopAudio()
  const ctx = getAudioContext()
  const source = ctx.createBufferSource()
  source.buffer = audioBuffer
  source.connect(ctx.destination)
  const offset = Math.max(0, offsetMs / 1000)
  source.start(0, offset)
  audioSource = source
}

async function decodeAudio(dataUrl) {
  if (!dataUrl) {
    audioBuffer = null
    return null
  }
  try {
    const ctx = getAudioContext()
    const response = await fetch(dataUrl)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const buffer = await response.arrayBuffer()
    audioBuffer = await ctx.decodeAudioData(buffer)
    return audioBuffer
  } catch (error) {
    console.warn("音频解码失败:", error)
    audioBuffer = null
    if (bpmStatus) bpmStatus.textContent = "音频解码失败"
    return null
  }
}

// BPM 估算基于能量峰检测，适配录入音频后自动更新
function estimateBpmFromOnsets(onsets) {
  if (onsets.length < 2) return 120
  const intervals = []
  for (let i = 1; i < onsets.length; i += 1) {
    intervals.push(onsets[i] - onsets[i - 1])
  }
  const avg = intervals.reduce((sum, value) => sum + value, 0) / intervals.length
  return Math.round(60000 / avg)
}

async function autoDetectBpmFromBuffer() {
  if (!audioBuffer) return
  bpmStatus.textContent = "BPM 计算中 0%"
  const channel = audioBuffer.getChannelData(0)
  const sampleRate = audioBuffer.sampleRate
  const windowSize = 2048
  const hopSize = 1024
  const energies = []
  const totalFrames = Math.floor((channel.length - windowSize) / hopSize)
  for (let i = 0; i < totalFrames; i += 1) {
    let sum = 0
    const start = i * hopSize
    for (let j = 0; j < windowSize; j += 1) {
      const value = channel[start + j] || 0
      sum += value * value
    }
    energies.push(sum / windowSize)
    if (i % 200 === 0) {
      const progress = Math.min(99, Math.round((i / totalFrames) * 100))
      bpmStatus.textContent = `BPM 计算中 ${progress}%`
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
  const meanEnergy = energies.reduce((sum, value) => sum + value, 0) / energies.length
  const threshold = meanEnergy * 1.5
  const onsets = []
  for (let i = 1; i < energies.length - 1; i += 1) {
    if (energies[i] > threshold && energies[i] > energies[i - 1] && energies[i] > energies[i + 1]) {
      const timeMs = (i * hopSize * 1000) / sampleRate
      onsets.push(timeMs)
    }
  }
  const bpmValue = Math.max(60, Math.min(200, estimateBpmFromOnsets(onsets)))
  bpm = bpmValue
  beatMs = 60000 / bpm
  bpmInput.value = String(bpm)
  bpmStatus.textContent = `BPM 已更新：${bpm}`
  refreshChartArea()
}

function setAudioMeta(name, dataUrl) {
  editorAudioName = name || "未选择音频"
  audioName.textContent = editorAudioName
  editorAudioDataUrl = dataUrl || null
  if (bpmStatus) {
    bpmStatus.textContent = dataUrl ? "BPM 计算中..." : "等待音频"
  }
  if (!dataUrl) {
    audioBuffer = null
    return
  }
  decodeAudio(dataUrl).then(() => {
    updateEditorDuration()
    refreshChartArea()
    renderTimelines()
    autoDetectBpmFromBuffer()
  })
}

function updateEditorDuration() {
  const audioMs = audioBuffer ? audioBuffer.duration * 1000 : 0
  const lastItem = editorItems.reduce((max, item) => Math.max(max, item.time), 0)
  const lastRecord = recordPath.reduce((max, point) => Math.max(max, point.time), 0)
  editorDurationMs = Math.max(30000, audioMs, lastItem + 2000, lastRecord + 2000)
}

// ========== 自动谱面生成 ==========

async function autoGenerateChart() {
  if (!audioBuffer) {
    setStatus("请先加载音频文件")
    return
  }
  const difficulty = difficultySelect ? difficultySelect.value : "normal"
  setStatus("正在分析音频…")
  autoGenerateButton.disabled = true

  await new Promise(r => setTimeout(r, 50)) // let UI update

  try {
    // Step 1: Multi-band onset detection
    const onsets = detectMultiBandOnsets(audioBuffer)
    setStatus(`检测到 ${onsets.length} 个节拍点，正在生成谱面…`)
    await new Promise(r => setTimeout(r, 50))

    // Step 2: Quantize onsets to BPM grid
    const quantized = quantizeOnsets(onsets, bpm)

    // Step 3: Generate items from quantized beats
    const items = generateItemsFromBeats(quantized, difficulty, audioBuffer.duration * 1000)

    // Step 4: Generate a matching record path
    const path = generateRecordPath(items, audioBuffer.duration * 1000)

    // Apply results
    editorItems = items
    recordPath = path
    updateEditorDuration()
    refreshChartArea()
    renderTimelines()

    setStatus(`谱面生成完成！${items.length} 个道具，难度：${difficulty}`)
  } catch (err) {
    console.error("谱面生成失败:", err)
    setStatus("谱面生成失败: " + err.message)
  } finally {
    autoGenerateButton.disabled = false
  }
}

function detectMultiBandOnsets(buffer) {
  const channel = buffer.getChannelData(0)
  const sr = buffer.sampleRate
  const fftSize = 2048
  const hopSize = 512
  const totalFrames = Math.floor((channel.length - fftSize) / hopSize)

  // Compute energy in 3 bands per frame
  const bassEnergies = []
  const midEnergies = []
  const highEnergies = []

  // Frequency bin boundaries
  const freqPerBin = sr / fftSize
  const bassEnd = Math.ceil(250 / freqPerBin)    // 0-250 Hz (bass/kick)
  const midEnd = Math.ceil(2000 / freqPerBin)     // 250-2000 Hz (melody/snare)
  const highEnd = Math.ceil(8000 / freqPerBin)    // 2000-8000 Hz (hats/cymbals)

  // Simple DFT-based energy estimation per band
  for (let frame = 0; frame < totalFrames; frame++) {
    const start = frame * hopSize
    let bassE = 0, midE = 0, highE = 0

    // Compute energy using time-domain approximation (faster than full FFT)
    // For bass: low-pass by averaging large windows
    // For simplicity, use energy in windowed segments
    for (let j = 0; j < fftSize; j++) {
      const v = channel[start + j] || 0
      const vSq = v * v
      // Rough band splitting using sample position modulation
      bassE += vSq
    }

    // Use spectral flux approximation: compute energy differences
    // Simple windowed energy for the whole band first
    const windowEnergy = bassE / fftSize
    bassEnergies.push(windowEnergy)

    // Compute high-frequency energy (difference between adjacent samples = derivative = high freq)
    let hfe = 0
    for (let j = 1; j < fftSize; j++) {
      const diff = (channel[start + j] || 0) - (channel[start + j - 1] || 0)
      hfe += diff * diff
    }
    highEnergies.push(hfe / fftSize)

    // Mid-frequency: second derivative approximation
    let mfe = 0
    for (let j = 2; j < fftSize; j++) {
      const d2 = (channel[start + j] || 0) - 2 * (channel[start + j - 1] || 0) + (channel[start + j - 2] || 0)
      mfe += d2 * d2
    }
    midEnergies.push(mfe / fftSize)
  }

  // Detect onsets via spectral flux in each band
  const onsets = []
  const windowAvg = 8 // frames for local average

  for (let i = windowAvg; i < totalFrames - 1; i++) {
    const timeMs = (i * hopSize * 1000) / sr

    // Local average for adaptive threshold
    let localBass = 0, localMid = 0, localHigh = 0
    for (let w = i - windowAvg; w < i; w++) {
      localBass += bassEnergies[w]
      localMid += midEnergies[w]
      localHigh += highEnergies[w]
    }
    localBass /= windowAvg
    localMid /= windowAvg
    localHigh /= windowAvg

    const bassFlux = bassEnergies[i] - bassEnergies[i - 1]
    const midFlux = midEnergies[i] - midEnergies[i - 1]
    const highFlux = highEnergies[i] - highEnergies[i - 1]

    // Peak detection with adaptive threshold
    const bassThresh = localBass * 1.8
    const midThresh = localMid * 2.0
    const highThresh = localHigh * 2.2

    let strength = 0
    let band = ""

    if (bassFlux > 0 && bassEnergies[i] > bassThresh && bassEnergies[i] > bassEnergies[i - 1] && bassEnergies[i] > bassEnergies[i + 1]) {
      strength += 3
      band = "bass"
    }
    if (midFlux > 0 && midEnergies[i] > midThresh && midEnergies[i] > midEnergies[i - 1] && midEnergies[i] > midEnergies[i + 1]) {
      strength += 2
      band = band || "mid"
    }
    if (highFlux > 0 && highEnergies[i] > highThresh && highEnergies[i] > highEnergies[i - 1] && highEnergies[i] > highEnergies[i + 1]) {
      strength += 1
      band = band || "high"
    }

    if (strength > 0) {
      // Avoid duplicates within 80ms
      if (onsets.length === 0 || timeMs - onsets[onsets.length - 1].time > 80) {
        onsets.push({ time: timeMs, strength, band })
      }
    }
  }

  return onsets
}

function quantizeOnsets(onsets, currentBpm) {
  const beat = 60000 / currentBpm
  const halfBeat = beat / 2
  const quarterBeat = beat / 4

  return onsets.map(onset => {
    // Snap to nearest 1/4 beat
    const nearestQuarter = Math.round(onset.time / quarterBeat) * quarterBeat
    // Check if it's on a beat, half-beat, or quarter-beat
    const beatPhase = (nearestQuarter % beat) / beat
    let gridType = "quarter"
    if (Math.abs(beatPhase) < 0.01 || Math.abs(beatPhase - 1) < 0.01) gridType = "beat"
    else if (Math.abs(beatPhase - 0.5) < 0.01) gridType = "half"

    return {
      time: nearestQuarter,
      strength: onset.strength,
      band: onset.band,
      gridType
    }
  })
}

function generateItemsFromBeats(quantized, difficulty, durationMs) {
  // Difficulty parameters
  const config = {
    easy: { density: 0.4, ghostRate: 0.08, powerRate: 0.04, minGap: 600, laneChange: 0.25 },
    normal: { density: 0.6, ghostRate: 0.14, powerRate: 0.05, minGap: 400, laneChange: 0.4 },
    hard: { density: 0.8, ghostRate: 0.20, powerRate: 0.06, minGap: 250, laneChange: 0.55 },
    expert: { density: 0.95, ghostRate: 0.28, powerRate: 0.07, minGap: 150, laneChange: 0.7 }
  }[difficulty] || config.normal

  // Filter by density — keep stronger beats first
  const sorted = [...quantized].sort((a, b) => b.strength - a.strength)
  const keepCount = Math.floor(sorted.length * config.density)
  const kept = new Set(sorted.slice(0, keepCount).map(o => o.time))
  const filtered = quantized.filter(o => kept.has(o.time))

  // Remove items too close together
  const spaced = []
  for (const onset of filtered) {
    if (onset.time < 500) continue // skip first 0.5s
    if (onset.time > durationMs - 500) continue // skip last 0.5s
    if (spaced.length > 0 && onset.time - spaced[spaced.length - 1].time < config.minGap) continue
    spaced.push(onset)
  }

  // Assign lanes using musical patterns
  const items = []
  let currentLane = 1 // start in middle
  let patternIndex = 0

  // Lane pattern generators
  const patterns = [
    // zigzag: 0,1,2,1,0,1,2...
    (i) => [0, 1, 2, 1][i % 4],
    // sweep up: 0,1,2,2,1,0
    (i) => [0, 1, 2, 2, 1, 0][i % 6],
    // hold center with occasional moves
    (i) => i % 3 === 0 ? (i % 6 < 3 ? 0 : 2) : 1,
    // alternating edges: 0,2,0,2 with center rest
    (i) => [0, 2, 1, 0, 2, 1][i % 6],
    // step down: 0,0,1,1,2,2
    (i) => Math.floor((i % 6) / 2),
  ]

  // Pick pattern, change every 8-16 beats
  let currentPattern = patterns[0]
  let patternCounter = 0
  let nextPatternChange = 8 + Math.floor(Math.random() * 8)

  // First pass: assign lanes
  for (let i = 0; i < spaced.length; i++) {
    patternCounter++
    if (patternCounter >= nextPatternChange) {
      patternCounter = 0
      nextPatternChange = 8 + Math.floor(Math.random() * 8)
      currentPattern = patterns[Math.floor(Math.random() * patterns.length)]
      patternIndex = 0
    }

    // Decide lane
    if (Math.random() < config.laneChange) {
      currentLane = currentPattern(patternIndex)
    }
    patternIndex++

    spaced[i].lane = currentLane
  }

  // Second pass: assign types
  // Mark ghost candidates: strong bass beats
  const ghostCandidates = new Set()
  for (let i = 0; i < spaced.length; i++) {
    if (spaced[i].strength >= 3 && spaced[i].band === "bass" && Math.random() < config.ghostRate * 3) {
      ghostCandidates.add(i)
    }
  }

  // Ensure we don't have too many ghosts
  const maxGhosts = Math.floor(spaced.length * config.ghostRate)
  const ghostIndices = [...ghostCandidates].slice(0, maxGhosts)
  const ghostSet = new Set(ghostIndices)

  // Place power-ups before ghost clusters
  const powerSet = new Set()
  for (const gi of ghostSet) {
    // Look back 3-6 items for a good power-up spot
    for (let back = 3; back <= 6 && gi - back >= 0; back++) {
      const candidate = gi - back
      if (!ghostSet.has(candidate) && !powerSet.has(candidate)) {
        if (Math.random() < config.powerRate * 8) {
          powerSet.add(candidate)
        }
        break
      }
    }
  }

  // Cap power-ups
  const maxPowers = Math.max(2, Math.floor(spaced.length * config.powerRate))
  const powerIndicesArr = [...powerSet].slice(0, maxPowers)
  const finalPowerSet = new Set(powerIndicesArr)

  // Build final items
  for (let i = 0; i < spaced.length; i++) {
    let type = "pellet"
    if (ghostSet.has(i)) type = "ghost"
    else if (finalPowerSet.has(i)) type = "power"

    items.push({
      time: Math.round(spaced[i].time),
      lane: spaced[i].lane,
      type
    })
  }

  // Ensure there are enough ghosts and at least 2 power-ups even on easy
  const ghostCount = items.filter(i => i.type === "ghost").length
  const powerCount = items.filter(i => i.type === "power").length

  if (ghostCount < 3 && items.length > 10) {
    // Convert some strong pellets to ghosts
    for (let i = 0; i < items.length && ghostCount < 3; i++) {
      if (items[i].type === "pellet" && i > 5 && i % 7 === 0) {
        items[i].type = "ghost"
      }
    }
  }

  if (powerCount < 2 && items.length > 8) {
    // Add power-ups before first ghost
    const firstGhost = items.findIndex(i => i.type === "ghost")
    if (firstGhost > 2) {
      items[firstGhost - 2].type = "power"
    }
    if (firstGhost > 5) {
      // Add another power-up later
      const secondGhost = items.findIndex((item, idx) => item.type === "ghost" && idx > firstGhost)
      if (secondGhost > 2) {
        items[secondGhost - 2].type = "power"
      }
    }
  }

  return items
}

function generateRecordPath(items, durationMs) {
  // Generate a smooth lane movement path from items
  const path = []
  const step = 40 // ms per sample, matching recording resolution
  let currentLane = 1

  // Build a lane schedule from items
  const laneSchedule = []
  for (const item of items) {
    laneSchedule.push({ time: item.time, lane: item.lane })
  }

  for (let t = 0; t <= durationMs; t += step) {
    // Find which lane we should be at time t
    // Look ahead — we need to be in position BEFORE the item arrives
    const lookAhead = 500 // ms to prepare
    let targetLane = currentLane

    for (const sched of laneSchedule) {
      if (sched.time >= t && sched.time <= t + lookAhead) {
        targetLane = sched.lane
        break
      }
    }

    // Smooth transition
    if (targetLane !== currentLane) {
      currentLane = targetLane
    }

    path.push({ time: t, lane: currentLane })
  }

  return path
}

function buildObjectsFromItems(items) {
  return items.map((item, index) => ({
    id: `${index}-${item.time}`,
    time: item.time,
    lane: item.lane,
    type: item.type,
    passed: false,
    collected: false,
    hit: false
  }))
}

function setTool(tool) {
  toolState.active = tool
  if (toolSelect) {
    toolSelect.value = tool
  }
}

function clampLane(lane) {
  return Math.max(0, Math.min(lanes - 1, lane))
}

function moveLaneBy(key) {
  if (gameState !== "playing" && gameState !== "paused" && !recording) return
  if (key === "w") pacman.targetLane = clampLane(pacman.targetLane - 1)
  if (key === "x") pacman.targetLane = clampLane(pacman.targetLane + 1)
  if (key === "s") pacman.targetLane = 1
}

function resetGameState() {
  score = 0
  combo = 0
  pellets = 0
  lives = maxLives
  invincibleUntil = 0
  powerUntil = 0
  pacman.lane = 1
  pacman.targetLane = 1
  pacman.y = laneToY(1)
  particles.length = 0
  shockwaves.length = 0
  comboPopups.length = 0
  screenShake = 0
  screenShakeIntensity = 0
  updateHud()
}

function enterReadyState() {
  if (!currentSong) return
  if (gameState === "playing" || gameState === "ready") return
  if (gameState === "gameover") return
  clearGameOver()
  resetGameState()
  objects = buildObjectsFromItems(currentSong.items)
  bpm = currentSong.bpm
  beatMs = 60000 / bpm
  gameState = "ready"
  setStatus("准备就绪 — 按空格或点击 ▶ 开始")
}

function drawReadyScreen() {
  ctx.save()
  ctx.fillStyle = "#FFFFFF"
  ctx.font = "bold 48px 'Roboto', sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.shadowColor = "rgba(255,255,255,0.5)"
  ctx.shadowBlur = 15
  ctx.fillText("准备就绪", canvas.width / 2, canvas.height / 2 - 20)
  ctx.shadowBlur = 0
  ctx.fillStyle = "rgba(255,255,255,0.5)"
  ctx.font = "20px 'Roboto', sans-serif"
  ctx.fillText("请摆好姿势，按 空格 或点击 ▶ 开始", canvas.width / 2, canvas.height / 2 + 30)
  ctx.restore()
}

function launchFromReady() {
  if (gameState !== "ready") return
  startTime = performance.now()
  audioOffsetMs = 0
  gameState = "playing"
  setStatus("节奏进行中")
  playAudio(0)
}

function startGame() {
  if (gameState === "ready") {
    launchFromReady()
  } else {
    enterReadyState()
  }
}

function pauseGame() {
  if (gameState !== "playing") return
  gameState = "paused"
  pausedAt = performance.now()
  setStatus("已暂停")
  audioOffsetMs = Math.max(0, performance.now() - startTime)
  stopAudio()
}

function resumeGame() {
  if (gameState !== "paused") return
  const pauseDuration = performance.now() - pausedAt
  startTime += pauseDuration
  gameState = "playing"
  setStatus("节奏进行中")
  playAudio(audioOffsetMs)
}

function resetGame() {
  gameState = "idle"
  setStatus("按空格开始")
  resetGameState()
  stopAudio()
  clearGameOver()
}

function drawTrack() {
  // Classic arcade black background
  ctx.fillStyle = "#000000"
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Draw lane boundaries as classic blue maze walls (double lines)
  const wallColor = "#2121DE" // classic Pac-Man blue
  const wallHighlight = "#4242FF"
  const laneTop = laneToY(0) - laneHeight / 2
  const laneBottom = laneToY(2) + laneHeight / 2

  // Outer walls
  ctx.strokeStyle = wallColor
  ctx.lineWidth = 3
  // Top wall
  ctx.beginPath()
  ctx.moveTo(60, laneTop)
  ctx.lineTo(canvas.width - 20, laneTop)
  ctx.stroke()
  // Bottom wall
  ctx.beginPath()
  ctx.moveTo(60, laneBottom)
  ctx.lineTo(canvas.width - 20, laneBottom)
  ctx.stroke()

  // Inner lane dividers (dashed, thinner)
  ctx.strokeStyle = wallHighlight
  ctx.lineWidth = 1
  ctx.setLineDash([8, 12])
  for (let lane = 0; lane < lanes - 1; lane++) {
    const divY = laneToY(lane) + laneHeight / 2
    ctx.beginPath()
    ctx.moveTo(80, divY)
    ctx.lineTo(canvas.width - 40, divY)
    ctx.stroke()
  }
  ctx.setLineDash([])

  // Small dot grid pattern (arcade-style background detail)
  ctx.fillStyle = "rgba(33, 33, 222, 0.15)"
  for (let x = 80; x < canvas.width - 40; x += 32) {
    for (let lane = 0; lane < lanes; lane++) {
      const y = laneToY(lane)
      ctx.fillRect(x - 1, y - 1, 2, 2)
    }
  }

  // Pac-Man position indicator line
  ctx.strokeStyle = "rgba(255, 255, 0, 0.15)"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(pacmanX, laneTop)
  ctx.lineTo(pacmanX, laneBottom)
  ctx.stroke()
}

function drawPacman() {
  if (isInvincible() && Math.floor(performance.now() / 150) % 2 === 0) {
    return
  }
  ctx.save()
  pacman.mouth += pacman.mouthSpeed
  if (pacman.mouth > 0.35 || pacman.mouth < 0) pacman.mouthSpeed *= -1
  const targetY = laneToY(pacman.targetLane)
  pacman.y += (targetY - pacman.y) * 0.2
  pacman.lane = Math.round((pacman.y - 60) / laneHeight)

  // Classic Pac-Man pixel sprite (13x13, 0=empty 1=yellow 2=black/eye)
  // Two animation frames: mouth open and mouth closed
  const mouthOpen = pacman.mouth > 0.15
  const sprite = mouthOpen ? [
    // Mouth open frame (facing right)
    [0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0],
    [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
    [1, 1, 1, 2, 2, 1, 1, 1, 0, 0, 0, 0, 0],
    [1, 1, 1, 2, 2, 1, 1, 0, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
    [0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0],
  ] : [
    // Mouth closed frame (full circle)
    [0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0],
    [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
    [0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0],
  ]

  const px = 4 // each pixel = 4x4 canvas pixels
  const spriteW = sprite[0].length
  const spriteH = sprite.length
  const offsetX = pacmanX - (spriteW * px) / 2
  const offsetY = pacman.y - (spriteH * px) / 2

  ctx.imageSmoothingEnabled = false
  for (let row = 0; row < spriteH; row++) {
    for (let col = 0; col < spriteW; col++) {
      const val = sprite[row][col]
      if (val === 0) continue
      ctx.fillStyle = val === 1 ? "#FFFF00" : "#000000"
      ctx.fillRect(offsetX + col * px, offsetY + row * px, px, px)
    }
  }

  ctx.restore()
}

function spawnPelletEffect(x, y) {
  for (let i = 0; i < 12; i++) {
    const angle = (Math.PI * 2 * i) / 12 + (Math.random() - 0.5) * 0.4
    const speed = 1.5 + Math.random() * 2.5
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: 0.025 + Math.random() * 0.015,
      radius: 2 + Math.random() * 3,
      color: Math.random() > 0.3 ? "#ffd36a" : "#fff4b0"
    })
  }
}

function spawnPowerEffect(x, y) {
  shockwaves.push({ x, y, radius: 10, maxRadius: 60, life: 1, color: "rgba(126, 242, 255," })
  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = 2 + Math.random() * 3
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: 0.018 + Math.random() * 0.012,
      radius: 3 + Math.random() * 4,
      color: Math.random() > 0.4 ? "#7ef2ff" : "#b8f9ff"
    })
  }
}

function spawnGhostEatenEffect(x, y) {
  shockwaves.push({ x, y, radius: 8, maxRadius: 50, life: 1, color: "rgba(107, 214, 255," })
  for (let i = 0; i < 18; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = 2.5 + Math.random() * 3
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: 0.02 + Math.random() * 0.01,
      radius: 2.5 + Math.random() * 3.5,
      color: Math.random() > 0.5 ? "#6bd6ff" : "#a0e8ff"
    })
  }
}

function spawnGhostDamageEffect(x, y) {
  screenShake = performance.now()
  screenShakeIntensity = 6
  shockwaves.push({ x, y, radius: 6, maxRadius: 45, life: 1, color: "rgba(255, 80, 123," })
  for (let i = 0; i < 16; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = 2 + Math.random() * 3
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: 0.022 + Math.random() * 0.012,
      radius: 2.5 + Math.random() * 3,
      color: Math.random() > 0.4 ? "#ff507b" : "#ff8ba0"
    })
  }
}

function spawnComboPopup(x, y, text, color) {
  comboPopups.push({ x, y, text, color, life: 1, decay: 0.02 })
}

function updateAndDrawParticles() {
  // Particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.x += p.vx
    p.y += p.vy
    p.vx *= 0.96
    p.vy *= 0.96
    p.life -= p.decay
    if (p.life <= 0) {
      particles.splice(i, 1)
      continue
    }
    ctx.globalAlpha = p.life
    ctx.fillStyle = p.color
    ctx.shadowColor = p.color
    ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.radius * p.life, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.shadowBlur = 0

  // Shockwaves
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const s = shockwaves[i]
    s.radius += (s.maxRadius - s.radius) * 0.12
    s.life -= 0.03
    if (s.life <= 0) {
      shockwaves.splice(i, 1)
      continue
    }
    ctx.globalAlpha = s.life * 0.6
    ctx.strokeStyle = s.color + `${s.life * 0.8})`
    ctx.lineWidth = 2 + s.life * 2
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Combo popups
  for (let i = comboPopups.length - 1; i >= 0; i--) {
    const c = comboPopups[i]
    c.y -= 0.8
    c.life -= c.decay
    if (c.life <= 0) {
      comboPopups.splice(i, 1)
      continue
    }
    ctx.globalAlpha = c.life
    ctx.fillStyle = c.color
    ctx.font = "bold 16px Roboto"
    ctx.textAlign = "center"
    ctx.fillText(c.text, c.x, c.y)
    ctx.textAlign = "start"
  }

  ctx.globalAlpha = 1
}

function drawObject(object, x) {
  const y = laneToY(object.lane)

  if (object.type === "pellet") {
    // Classic small white pellet dot
    ctx.fillStyle = "#FFCC99"
    ctx.beginPath()
    ctx.arc(x, y, 4, 0, Math.PI * 2)
    ctx.fill()
  } else if (object.type === "power") {
    // Classic large flashing power pellet
    const flash = Math.floor(performance.now() / 200) % 2 === 0
    if (flash) {
      ctx.fillStyle = "#FFCC99"
      ctx.beginPath()
      ctx.arc(x, y, 10, 0, Math.PI * 2)
      ctx.fill()
    }
  } else if (object.type === "ghost") {
    const powered = isPowered()
    const size = 14 // half-width of ghost sprite
    const ghostH = 28

    ctx.save()
    ctx.translate(x, y)

    if (powered) {
      // Scared ghost: classic blue with flash when ending
      const remaining = Math.max(0, powerUntil - performance.now())
      const flashing = remaining < 2000 && Math.floor(performance.now() / 200) % 2 === 0
      ctx.fillStyle = flashing ? "#FFFFFF" : "#2121FF"

      // Dome head
      ctx.beginPath()
      ctx.arc(0, -4, size, Math.PI, 0)
      // Body
      ctx.lineTo(size, ghostH / 2 - 4)
      // Wavy bottom (3 waves)
      const waveW = (size * 2) / 3
      for (let w = 0; w < 3; w++) {
        const wx = size - w * waveW
        ctx.lineTo(wx - waveW / 2, ghostH / 2 - 4 + 5)
        ctx.lineTo(wx - waveW, ghostH / 2 - 4)
      }
      ctx.closePath()
      ctx.fill()

      // Scared eyes (simple lines)
      ctx.fillStyle = flashing ? "#FF0000" : "#FFCC99"
      ctx.fillRect(-6, -4, 3, 3)
      ctx.fillRect(3, -4, 3, 3)

      // Squiggly mouth
      ctx.strokeStyle = flashing ? "#FF0000" : "#FFCC99"
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(-7, 4)
      for (let sx = -7; sx <= 7; sx += 3.5) {
        ctx.lineTo(sx + 1.75, sx % 7 === 0 ? 6 : 2)
      }
      ctx.stroke()
    } else {
      // Normal ghost: pick color based on object position
      const ghostColors = ["#FF0000", "#FFB8FF", "#00FFFF", "#FFB852"] // Blinky, Pinky, Inky, Clyde
      const colorIndex = Math.abs(Math.floor(object.time / 500)) % 4
      ctx.fillStyle = ghostColors[colorIndex]

      // Dome head
      ctx.beginPath()
      ctx.arc(0, -4, size, Math.PI, 0)
      // Body sides
      ctx.lineTo(size, ghostH / 2 - 4)
      // Wavy bottom skirt (3 tentacles)
      const waveW = (size * 2) / 3
      const wavePhase = performance.now() / 200
      for (let w = 0; w < 3; w++) {
        const wx = size - w * waveW
        const wobble = Math.sin(wavePhase + w) * 2
        ctx.lineTo(wx - waveW / 2, ghostH / 2 - 4 + 5 + wobble)
        ctx.lineTo(wx - waveW, ghostH / 2 - 4)
      }
      ctx.closePath()
      ctx.fill()

      // Eyes: white sclera with blue pupils
      // Left eye
      ctx.fillStyle = "#FFFFFF"
      ctx.beginPath()
      ctx.ellipse(-5, -4, 5, 6, 0, 0, Math.PI * 2)
      ctx.fill()
      // Right eye
      ctx.beginPath()
      ctx.ellipse(5, -4, 5, 6, 0, 0, Math.PI * 2)
      ctx.fill()
      // Pupils (looking left = toward Pac-Man)
      ctx.fillStyle = "#2121DE"
      ctx.beginPath()
      ctx.arc(-7, -3, 2.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(3, -3, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.restore()
  }
}

function updateObjects(elapsed) {
  const speed = (canvas.width - pacmanX + 120) / leadTime
  const now = performance.now()
  objects.forEach((object) => {
    const spawnAt = object.time - leadTime
    if (elapsed < spawnAt) return
    const x = canvas.width - (elapsed - spawnAt) * speed
    if (x < pacmanX - 30 && !object.passed) {
      object.passed = true
      if ((object.type === "pellet" || object.type === "power") && !object.collected) {
        combo = 0
      }
    }
    if (x < pacmanX - 60) return
    drawObject(object, x)
    if (!object.collected && Math.abs(x - pacmanX) < hitWindow) {
      if (object.type === "pellet") {
        if (pacman.targetLane === object.lane) {
          object.collected = true
          pellets += 1
          combo += 1
          const pelletScore = isPowered() ? 40 : 20
          spawnPelletEffect(pacmanX, laneToY(object.lane))
          if (combo > 1) spawnComboPopup(pacmanX + 30, laneToY(object.lane) - 15, `${combo}x`, "#ffd36a")
          score += pelletScore + combo * 2
        }
      } else if (object.type === "power") {
        if (pacman.targetLane === object.lane) {
          object.collected = true
          pellets += 1
          combo += 1
          powerUntil = now + powerDuration
          score += 20 + combo * 2
          spawnPowerEffect(pacmanX, laneToY(object.lane))
          setStatus("大力丸！10 秒可吃幽灵")
        }
      } else if (object.type === "ghost") {
        if (pacman.targetLane === object.lane && !object.hit) {
          object.hit = true
          if (isPowered()) {
            object.collected = true
            combo += 1
            score += 40 + combo * 2
            spawnGhostEatenEffect(pacmanX, laneToY(object.lane))
            spawnComboPopup(pacmanX + 30, laneToY(object.lane) - 15, `+${40 + combo * 2}`, "#6bd6ff")
            setStatus("吃掉幽灵")
          } else if (isInvincible()) {
            return
          } else {
            combo = 0
            lives -= 1
            invincibleUntil = now + invincibleDuration
            spawnGhostDamageEffect(pacmanX, laneToY(object.lane))
            score = Math.max(0, score - 50)
            if (lives <= 0) {
              setGameOver("生命耗尽")
            } else {
              setStatus("撞到了幽灵，无敌 3 秒")
            }
          }
        }
      }
    }
  })
}

function updateGame() {
  // Screen shake offset
  let shakeX = 0, shakeY = 0
  if (screenShake > 0 && performance.now() - screenShake < 300) {
    const t = (performance.now() - screenShake) / 300
    const intensity = screenShakeIntensity * (1 - t)
    shakeX = (Math.random() - 0.5) * intensity * 2
    shakeY = (Math.random() - 0.5) * intensity * 2
  }
  ctx.save()
  ctx.translate(shakeX, shakeY)
  drawTrack()
  drawPacman()
  if (gameState === "ready") {
    drawReadyScreen()
    updateAndDrawParticles()
    ctx.restore()
    updateHud()
    return
  }
  if (gameState !== "playing") {
    updateAndDrawParticles()
    ctx.restore()
    updateHud()
    return
  }
  const elapsed = performance.now() - startTime
  updateObjects(elapsed)
  updateAndDrawParticles()
  ctx.restore()
  updateHud()
  const durationMs = currentSong?.durationMs ?? editorDurationMs
  const finished = objects.every((object) => object.passed || object.collected || object.hit)
  if (finished && elapsed > durationMs + leadTime) {
    stopAudio()
    setGameOver("节奏完成")
  }
}

// 游戏结束弹窗与音频资源释放
function setGameOver(reason) {
  gameState = "gameover"
  stopAudio()
  setStatus("对决结束")
  gameOverTitle.textContent = "对决结束"
  gameOverReason.textContent = reason
  gameOverScore.textContent = String(score)
  gameOverModal.classList.remove("hidden")
  startButton.disabled = true
  pauseButton.disabled = true
  resetButton.disabled = true
}

function clearGameOver() {
  gameState = "idle"
  gameOverModal.classList.add("hidden")
  startButton.disabled = false
  pauseButton.disabled = false
  resetButton.disabled = false
}

function drawTimelineBase(context, width) {
  context.fillStyle = "#0b1020"
  context.fillRect(0, 0, width, timelineHeight)
  for (let lane = 0; lane < lanes; lane += 1) {
    const y = timelineLaneY(lane)
    context.strokeStyle = "rgba(120,150,255,0.45)"
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(timelinePadding, y)
    context.lineTo(width - 20, y)
    context.stroke()
  }
  const durationSec = Math.floor(width / pxPerSecond)
  for (let second = 0; second <= durationSec; second += 1) {
    const x = timelinePadding + second * pxPerSecond
    context.strokeStyle = "rgba(255,255,255,0.08)"
    context.beginPath()
    context.moveTo(x, 12)
    context.lineTo(x, timelineHeight - 12)
    context.stroke()
    context.fillStyle = "rgba(255,255,255,0.4)"
    context.font = "12px Roboto"
    context.fillText(`${second}s`, x + 4, 20)
  }
}

function drawRecordPath(context, width) {
  if (!recordPath.length) return
  context.strokeStyle = "rgba(255, 108, 108, 0.8)"
  context.lineWidth = 3
  context.beginPath()
  recordPath.forEach((point, index) => {
    const x = timelinePadding + (point.time / 1000) * pxPerSecond
    const y = timelineLaneY(point.lane)
    if (index === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  })
  context.stroke()
}

function drawItems(context, width) {
  editorItems.forEach((item) => {
    const x = timelinePadding + (item.time / 1000) * pxPerSecond
    const y = timelineLaneY(item.lane)
    if (item.type === "pellet") {
      context.fillStyle = "#ffd36a"
      context.beginPath()
      context.arc(x, y, 8, 0, Math.PI * 2)
      context.fill()
    } else if (item.type === "power") {
      context.fillStyle = "#7ef2ff"
      context.beginPath()
      context.arc(x, y, 11, 0, Math.PI * 2)
      context.fill()
    } else if (item.type === "ghost") {
      context.fillStyle = "#ff507b"
      context.beginPath()
      context.arc(x, y - 4, 10, Math.PI, 0)
      context.lineTo(x + 10, y + 8)
      context.lineTo(x - 10, y + 8)
      context.closePath()
      context.fill()
    }
  })
}

function resizeTimeline(canvasEl, durationMs) {
  const width = Math.max(600, timelinePadding + (durationMs / 1000) * pxPerSecond + 120)
  canvasEl.width = width
  canvasEl.height = timelineHeight
  return width
}

function drawPlaybackCursor(context, timeMs) {
  const x = timelinePadding + (timeMs / 1000) * pxPerSecond
  context.strokeStyle = "rgba(0, 230, 255, 0.9)"
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(x, 8)
  context.lineTo(x, timelineHeight - 8)
  context.stroke()
  context.fillStyle = "rgba(0, 230, 255, 0.9)"
  context.beginPath()
  context.moveTo(x - 5, 8)
  context.lineTo(x + 5, 8)
  context.lineTo(x, 16)
  context.closePath()
  context.fill()
}

function getRecordingElapsed() {
  if (recordingPaused) return recordPausedElapsed
  if (!recording) return 0
  return performance.now() - recordStartTime - recordTotalPauseDuration
}

function renderTimelines() {
  updateEditorDuration()
  const recordWidth = resizeTimeline(recordCanvas, editorDurationMs)
  const recordCtx = recordCanvas.getContext("2d")
  drawTimelineBase(recordCtx, recordWidth)
  drawRecordPath(recordCtx, recordWidth)
  const editorWidth = resizeTimeline(editorCanvas, editorDurationMs)
  const editorCtx = editorCanvas.getContext("2d")
  drawTimelineBase(editorCtx, editorWidth)
  drawRecordPath(editorCtx, editorWidth)
  drawItems(editorCtx, editorWidth)

  // Determine cursor position
  let cursorMs
  if (recording || recordingPaused) {
    cursorMs = getRecordingElapsed()
  } else if (editorPreviewPlaying) {
    cursorMs = editorCursorMs + (performance.now() - editorPreviewStartTime)
  } else {
    cursorMs = editorCursorMs
  }
  drawPlaybackCursor(recordCtx, cursorMs)
  drawPlaybackCursor(editorCtx, cursorMs)
}

function timelineXToMs(canvasX) {
  const timeMs = ((canvasX - timelinePadding) / pxPerSecond) * 1000
  return Math.max(0, timeMs)
}

function getCanvasXFromEvent(event, canvasEl) {
  // For mousedown/pointerdown, offsetX is reliable
  if (event.type === "pointerdown" || event.type === "mousedown") {
    return event.offsetX
  }
  // For pointermove during capture, compute from clientX
  const container = canvasEl.parentElement
  const containerRect = container.getBoundingClientRect()
  return event.clientX - containerRect.left + container.scrollLeft
}

let dragSourceCanvas = null

function handleTimelineCursorDown(event, canvasEl) {
  event.preventDefault()
  event.stopPropagation()
  const canvasX = event.offsetX
  const timeMs = timelineXToMs(canvasX)
  editorCursorDragging = true
  editorCursorMs = timeMs
  dragSourceCanvas = canvasEl
  canvasEl.setPointerCapture(event.pointerId)

  if (recordingPaused) {
    seekRecordingTo(timeMs)
  } else {
    if (editorPreviewPlaying) {
      stopAudio()
      editorPreviewPlaying = false
    }
    renderTimelines()
  }
}

function handleTimelineCursorMove(event) {
  if (!editorCursorDragging || !dragSourceCanvas) return
  const canvasX = getCanvasXFromEvent(event, dragSourceCanvas)
  const timeMs = timelineXToMs(canvasX)
  editorCursorMs = timeMs

  if (recordingPaused) {
    seekRecordingTo(timeMs)
  } else {
    renderTimelines()
  }
}

function handleTimelineCursorUp(event) {
  if (!editorCursorDragging) return
  editorCursorDragging = false
  if (dragSourceCanvas && event.pointerId !== undefined) {
    try { dragSourceCanvas.releasePointerCapture(event.pointerId) } catch (e) { }
  }
  dragSourceCanvas = null
}

function scrollTimelineToTime(container, timeMs) {
  const x = timelinePadding + (timeMs / 1000) * pxPerSecond
  const target = Math.max(0, x - container.clientWidth * 0.5)
  container.scrollLeft = target
}

function removeItemsNear(time, lane) {
  const threshold = 160
  editorItems = editorItems.filter(
    (item) => !(item.lane === lane && Math.abs(item.time - time) < threshold)
  )
}

function handleEditorClick(event) {
  const x = event.offsetX
  const y = event.offsetY
  const time = ((x - timelinePadding) / pxPerSecond) * 1000
  if (time < 0) return
  const lane = clampLane(Math.round((y - timelineTop) / timelineLaneHeight))
  if (toolState.active === "erase") {
    removeItemsNear(time, lane)
  } else {
    removeItemsNear(time, lane)
    editorItems.push({
      time,
      lane,
      type: toolState.active
    })
    editorItems.sort((a, b) => a.time - b.time)
  }
  refreshChartArea()
  renderTimelines()
}

function refreshChartArea() {
  chartArea.value = JSON.stringify(
    {
      name: songNameInput.value.trim() || "未命名曲目",
      bpm,
      durationMs: editorDurationMs,
      items: editorItems,
      recordPath
    },
    null,
    2
  )
}

function loadChartFromText() {
  try {
    const data = JSON.parse(chartArea.value)
    bpm = Number(data.bpm) || 120
    beatMs = 60000 / bpm
    bpmInput.value = String(bpm)
    editorItems = Array.isArray(data.items) ? data.items : []
    recordPath = Array.isArray(data.recordPath) ? data.recordPath : []
    editorDurationMs = Number(data.durationMs) || editorDurationMs
    refreshChartArea()
    renderTimelines()
  } catch (error) {
    setStatus("谱面解析失败")
  }
}

function startRecording() {
  if (recording) return
  recording = true
  recordingPaused = false

  const startFromMs = editorCursorMs || 0
  // Do NOT trim existing path — keep all data intact
  // Recording will only append once we pass beyond the existing path's end
  recordLastSample = startFromMs
  recordPausedElapsed = startFromMs
  recordTotalPauseDuration = 0
  recordPauseStartTime = 0
  // Set recordStartTime so that elapsed = startFromMs at this moment
  recordStartTime = performance.now() - startFromMs

  const pathEndMs = recordPath.length > 0
    ? recordPath[recordPath.length - 1].time
    : 0
  if (startFromMs < pathEndMs) {
    setStatus("播放中... 超过已录制部分后自动继续录制")
  } else {
    setStatus("录制中 (Q暂停 / Esc停止)")
  }
  playAudio(startFromMs)
}

function pauseRecording() {
  if (!recording || recordingPaused) return
  recordingPaused = true
  recordPausedElapsed = performance.now() - recordStartTime - recordTotalPauseDuration
  recordPauseStartTime = performance.now()
  stopAudio()
  setStatus("暂停 (Q预览续录 / Shift+Q覆盖录制 / Esc停止)")
  renderTimelines()
  const recordContainer = recordCanvas.parentElement
  const editorContainer = editorCanvas.parentElement
  scrollTimelineToTime(recordContainer, recordPausedElapsed)
  scrollTimelineToTime(editorContainer, recordPausedElapsed)
}

function resumeRecording() {
  if (!recording || !recordingPaused) return
  recordingPaused = false
  const thisPauseDuration = performance.now() - recordPauseStartTime
  recordTotalPauseDuration += thisPauseDuration
  const realElapsed = performance.now() - recordStartTime - recordTotalPauseDuration
  if (Math.abs(realElapsed - recordPausedElapsed) > 10) {
    recordTotalPauseDuration = performance.now() - recordStartTime - recordPausedElapsed
  }
  // Keep all data intact — only append past the end
  recordLastSample = recordPausedElapsed
  setStatus("播放中... 超过已录制部分后自动继续录制")
  playAudio(recordPausedElapsed)
}

// Overwrite mode: trim path from cursor forward and re-record
function startOverwriteRecording() {
  if (recording) return
  recording = true
  recordingPaused = false

  const startFromMs = editorCursorMs || 0
  // Trim everything from cursor position forward
  recordPath = recordPath.filter(p => p.time <= startFromMs)
  recordLastSample = startFromMs
  recordPausedElapsed = startFromMs
  recordTotalPauseDuration = 0
  recordPauseStartTime = 0
  recordStartTime = performance.now() - startFromMs

  setStatus("✅ 覆盖录制中 (Q暂停 / Esc停止)")
  playAudio(startFromMs)
}

function resumeOverwriteRecording() {
  if (!recording || !recordingPaused) return
  recordingPaused = false
  const thisPauseDuration = performance.now() - recordPauseStartTime
  recordTotalPauseDuration += thisPauseDuration
  const realElapsed = performance.now() - recordStartTime - recordTotalPauseDuration
  if (Math.abs(realElapsed - recordPausedElapsed) > 10) {
    recordTotalPauseDuration = performance.now() - recordStartTime - recordPausedElapsed
  }
  // Trim everything from cursor position forward
  recordPath = recordPath.filter(p => p.time <= recordPausedElapsed)
  recordLastSample = recordPausedElapsed
  setStatus("✅ 覆盖录制中 (Q暂停 / Esc停止)")
  playAudio(recordPausedElapsed)
}

function seekRecording(deltaMs) {
  if (!recordingPaused) return
  seekRecordingTo(recordPausedElapsed + deltaMs)
}

function seekRecordingTo(timeMs) {
  const maxMs = audioBuffer ? audioBuffer.duration * 1000 : editorDurationMs
  recordPausedElapsed = Math.max(0, Math.min(maxMs, timeMs))
  // Do NOT trim existing recordPath — only set the resume point
  recordLastSample = recordPausedElapsed
  setStatus(`录制暂停 ${(recordPausedElapsed / 1000).toFixed(1)}s (←→ 调整 / Q继续 / Esc停止)`)
  renderTimelines()
  const recordContainer = recordCanvas.parentElement
  const editorContainer = editorCanvas.parentElement
  scrollTimelineToTime(recordContainer, recordPausedElapsed)
  scrollTimelineToTime(editorContainer, recordPausedElapsed)
}

function stopRecording() {
  if (!recording) return
  recording = false
  recordingPaused = false
  stopAudio()
  setStatus("录制结束")
  refreshChartArea()
  renderTimelines()
}

function updateRecording() {
  if (!recording || recordingPaused) return
  const now = performance.now()
  const time = now - recordStartTime - recordTotalPauseDuration
  if (audioBuffer && time >= audioBuffer.duration * 1000) {
    stopRecording()
    return
  }
  // Find the end of existing recorded data
  const pathEndMs = recordPath.length > 0
    ? recordPath[recordPath.length - 1].time
    : 0

  if (time > pathEndMs) {
    // We are past the existing path — actively recording
    if (time - recordLastSample > 40) {
      recordPath.push({
        time,
        lane: pacman.targetLane
      })
      recordLastSample = time
    }
    // Update status to indicate we're now recording
    if (pathEndMs > 0 && time - pathEndMs < 100) {
      setStatus("录制中 (Q暂停 / Esc停止)")
    }
  }
  // Always scroll to follow playback
  const recordContainer = recordCanvas.parentElement
  const editorContainer = editorCanvas.parentElement
  scrollTimelineToTime(recordContainer, time)
  scrollTimelineToTime(editorContainer, time)

  if (time > editorDurationMs - 1000) {
    editorDurationMs = time + 2000
  }
}

// 统一写入：IndexedDB 为主，file:// 环境同步到 OPFS（跳过文件夹曲谱包）
async function saveSongs() {
  const persistSongs = songs.filter((song) => song.source !== "folder")
  await Promise.all(persistSongs.map((song) => putSong(song)))
  await writeSongsToFileSystem(persistSongs)
}

// 迁移历史 localStorage 数据到当前存储适配器
async function mergeLegacySongs() {
  const legacyRaw = localStorage.getItem(storageKey)
  if (!legacyRaw) return
  try {
    const legacySongs = JSON.parse(legacyRaw)
    if (Array.isArray(legacySongs)) {
      let merged = 0
      legacySongs.forEach((legacy) => {
        if (!songs.some((song) => song.id === legacy.id)) {
          songs.push(legacy)
          merged++
        }
      })
      // Migration complete — remove legacy data so deleted songs don't resurrect
      localStorage.removeItem(storageKey)
      if (merged > 0) {
        console.log(`迁移了 ${merged} 首旧曲目，已清除 localStorage`)
      }
    }
  } catch (error) {
    // If parse fails, still remove the corrupted data
    localStorage.removeItem(storageKey)
    return
  }
}

// 载入逻辑：IndexedDB -> file:// fallback -> localStorage 迁移 -> 文件夹曲谱包
async function loadSongs() {
  try {
    songs = await getAllSongs()
    console.log(`[加载] IndexedDB: ${songs.length} 首曲目`)
  } catch (error) {
    songs = []
  }
  const fileSongs = await readSongsFromFileSystem()
  if (Array.isArray(fileSongs) && fileSongs.length) {
    let added = 0
    fileSongs.forEach((fileSong) => {
      if (!songs.some((song) => song.id === fileSong.id)) {
        songs.push(fileSong)
        added++
      }
    })
    if (added > 0) {
      console.log(`[加载] 文件系统: 新增 ${added} 首`)
      await Promise.all(songs.map((song) => putSong(song)))
    }
  }
  await mergeLegacySongs()
  // 加载文件夹曲谱包 — always refresh from disk (remove old folder entries first)
  songs = songs.filter(song => song.source !== "folder")
  const folderPacks = await loadFolderPacks()
  folderPacks.forEach((pack) => {
    songs.push(pack)
  })
  console.log(`[加载] 文件夹曲谱包: ${folderPacks.length} 首`)
  if (!songs.length) {
    const defaultSong = {
      id: String(Date.now()),
      name: "默认曲目",
      bpm: 120,
      durationMs: 30000,
      items: [],
      recordPath: [],
      audioDataUrl: null,
      audioName: ""
    }
    songs = [defaultSong]
  }
  console.log(`[加载] 总计: ${songs.length} 首曲目`)
  await saveSongs()

  // Merge saved metadata overrides (artist, album, cover) onto all songs
  try {
    const allMeta = await getAllSongMeta()
    if (allMeta.length > 0) {
      const metaMap = new Map(allMeta.map(m => [m.id, m]))
      songs.forEach(song => {
        const meta = metaMap.get(song.id)
        if (meta) {
          if (meta.artist) song.artist = meta.artist
          if (meta.album) song.album = meta.album
          if (meta.coverDataUrl) song.coverDataUrl = meta.coverDataUrl
        }
      })
      console.log(`[加载] 已合并 ${allMeta.length} 条元数据`)
    }
  } catch (e) {
    console.warn("[加载] 元数据合并失败:", e)
  }
}

function renderSongList() {
  songList.innerHTML = ""
  songs.forEach((song) => {
    const card = document.createElement("div")
    card.className = "song-card"
    if (song.id === selectedSongId) card.classList.add("selected")

    // Cover art
    const cover = document.createElement("div")
    cover.className = "song-cover"
    if (song.coverDataUrl) {
      const img = document.createElement("img")
      img.src = song.coverDataUrl
      img.alt = song.name
      cover.appendChild(img)
    } else {
      cover.textContent = "🎵"
    }
    card.appendChild(cover)

    // Info column
    const info = document.createElement("div")
    info.className = "song-info"

    const title = document.createElement("div")
    title.className = "song-title"
    const isFolder = song.source === "folder"
    title.textContent = (isFolder ? "📁 " : "") + song.name
    info.appendChild(title)

    if (song.artist) {
      const artist = document.createElement("div")
      artist.className = "song-artist"
      artist.textContent = song.artist + (song.album ? " · " + song.album : "")
      info.appendChild(artist)
    }

    const meta = document.createElement("div")
    meta.className = "song-meta"
    const duration = Math.round((song.durationMs || 0) / 1000)
    meta.textContent = `${song.bpm} BPM · ${duration}s` + (isFolder ? " · 文件夹曲谱包" : "")
    info.appendChild(meta)

    card.appendChild(info)

    // Actions
    const actionRow = document.createElement("div")
    actionRow.className = "song-actions"

    // Edit metadata button (always available)
    const editBtn = document.createElement("button")
    editBtn.className = "outlined-button"
    editBtn.textContent = "✎"
    editBtn.title = "编辑信息"
    editBtn.addEventListener("click", (event) => {
      event.stopPropagation()
      openSongMetaModal(song.id)
    })
    actionRow.appendChild(editBtn)

    if (!isFolder) {
      const exportButton = document.createElement("button")
      exportButton.className = "outlined-button"
      exportButton.textContent = "导出"
      exportButton.addEventListener("click", async (event) => {
        event.stopPropagation()
        await exportSongAsZip(song.id)
      })
      actionRow.appendChild(exportButton)
      const deleteButton = document.createElement("button")
      deleteButton.className = "text-button"
      deleteButton.textContent = "删除"
      deleteButton.addEventListener("click", async (event) => {
        event.stopPropagation()
        await removeSong(song.id)
      })
      actionRow.appendChild(deleteButton)
    }
    card.appendChild(actionRow)

    card.addEventListener("click", () => {
      selectedSongId = song.id
      updateSelectedSong()
      renderSongList()
    })
    songList.appendChild(card)
  })
}

function openSongMetaModal(songId) {
  const song = songs.find(s => s.id === songId)
  if (!song) return

  // Remove existing modal if any
  const existing = document.querySelector(".modal-backdrop")
  if (existing) existing.remove()

  const backdrop = document.createElement("div")
  backdrop.className = "modal-backdrop"

  const modal = document.createElement("div")
  modal.className = "modal-card"

  let coverPreviewUrl = song.coverDataUrl || ""

  modal.innerHTML = `
    <div class="modal-title">编辑曲目信息</div>
    <div class="modal-field">
      <label>曲目名称</label>
      <input type="text" id="metaName" value="${(song.name || '').replace(/"/g, '&quot;')}" />
    </div>
    <div class="modal-field">
      <label>歌手 / 艺术家</label>
      <input type="text" id="metaArtist" value="${(song.artist || '').replace(/"/g, '&quot;')}" placeholder="例如: Daft Punk" />
    </div>
    <div class="modal-field">
      <label>专辑</label>
      <input type="text" id="metaAlbum" value="${(song.album || '').replace(/"/g, '&quot;')}" placeholder="例如: Discovery" />
    </div>
    <div class="modal-field">
      <label>封面</label>
      <div class="modal-cover-upload">
        <div class="modal-cover-preview" id="metaCoverPreview">
          ${coverPreviewUrl ? `<img src="${coverPreviewUrl}" />` : "🎵"}
        </div>
        <div>
          <button class="outlined-button" id="metaCoverBtn">选择图片</button>
          <input type="file" id="metaCoverInput" accept="image/*" style="display:none" />
          ${coverPreviewUrl ? '<button class="text-button" id="metaCoverClear">移除封面</button>' : ''}
        </div>
      </div>
    </div>
    <div class="modal-actions">
      <button class="text-button" id="metaCancel">取消</button>
      <button class="filled-button" id="metaSave">保存</button>
    </div>
  `

  backdrop.appendChild(modal)
  document.body.appendChild(backdrop)

  // Wire up cover upload
  const coverInput = modal.querySelector("#metaCoverInput")
  const coverBtn = modal.querySelector("#metaCoverBtn")
  const coverPreview = modal.querySelector("#metaCoverPreview")
  const clearBtn = modal.querySelector("#metaCoverClear")

  coverBtn.addEventListener("click", () => coverInput.click())
  coverPreview.addEventListener("click", () => coverInput.click())

  coverInput.addEventListener("change", () => {
    const file = coverInput.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      // Resize to 256px for storage efficiency
      const img = new Image()
      img.onload = () => {
        const size = 256
        const c = document.createElement("canvas")
        c.width = size
        c.height = size
        const cx = c.getContext("2d")
        // Center crop
        const min = Math.min(img.width, img.height)
        const sx = (img.width - min) / 2
        const sy = (img.height - min) / 2
        cx.drawImage(img, sx, sy, min, min, 0, 0, size, size)
        coverPreviewUrl = c.toDataURL("image/jpeg", 0.8)
        coverPreview.innerHTML = `<img src="${coverPreviewUrl}" />`
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      coverPreviewUrl = ""
      coverPreview.innerHTML = "🎵"
    })
  }

  // Cancel
  modal.querySelector("#metaCancel").addEventListener("click", () => backdrop.remove())
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) backdrop.remove() })

  // Save
  modal.querySelector("#metaSave").addEventListener("click", async () => {
    song.name = modal.querySelector("#metaName").value.trim() || "未命名曲目"
    song.artist = modal.querySelector("#metaArtist").value.trim()
    song.album = modal.querySelector("#metaAlbum").value.trim()
    song.coverDataUrl = coverPreviewUrl || null
    // Save metadata override to dedicated store (works for all song types incl. folder packs)
    await putSongMeta(song.id, {
      artist: song.artist,
      album: song.album,
      coverDataUrl: song.coverDataUrl
    })
    await saveSongs()
    renderSongList()
    renderSongSelect()
    updateSelectedSong()
    backdrop.remove()
  })
}

function renderSongSelect() {
  songSelect.innerHTML = ""
  songs.forEach((song) => {
    const option = document.createElement("option")
    option.value = song.id
    option.textContent = song.name
    songSelect.appendChild(option)
  })
}

function updateSelectedSong() {
  const song = songs.find((item) => item.id === selectedSongId)
  if (!song) {
    selectedSongTitle.textContent = "未选择曲目"
    selectedSongMeta.textContent = "请选择一个谱面"
    launchGameButton.disabled = true
    currentSong = null
    return
  }
  selectedSongTitle.textContent = song.name
  const parts = [`${song.bpm} BPM`, `${Math.round(song.durationMs / 1000)}s`]
  if (song.artist) parts.unshift(song.artist)
  selectedSongMeta.textContent = parts.join(" · ")
  launchGameButton.disabled = false
  currentSong = song
  setAudioMeta(song.audioName, song.audioDataUrl)
}

function loadSongToEditor(songId) {
  const song = songs.find((item) => item.id === songId)
  if (!song) return
  editorSongId = song.id
  bpm = song.bpm
  beatMs = 60000 / bpm
  bpmInput.value = String(bpm)
  songNameInput.value = song.name
  editorItems = Array.isArray(song.items) ? song.items : []
  recordPath = Array.isArray(song.recordPath) ? song.recordPath : []
  editorDurationMs = song.durationMs || editorDurationMs
  setAudioMeta(song.audioName, song.audioDataUrl)
  refreshChartArea()
  renderTimelines()
}

function createNewSong() {
  editorSongId = null
  bpm = 120
  beatMs = 60000 / bpm
  bpmInput.value = String(bpm)
  songNameInput.value = ""
  editorItems = []
  recordPath = []
  editorDurationMs = 30000
  audioBuffer = null
  setAudioMeta("未选择音频", null)
  refreshChartArea()
  renderTimelines()
}

function saveSongFromEditor() {
  const name = songNameInput.value.trim() || "未命名曲目"
  updateEditorDuration()
  editorItems.sort((a, b) => a.time - b.time)
  // Preserve existing metadata (artist, album, cover) if editing an existing song
  const existingSong = songs.find(s => s.id === editorSongId)
  const nowSong = {
    id: editorSongId || String(Date.now()),
    name,
    artist: existingSong?.artist || "",
    album: existingSong?.album || "",
    coverDataUrl: existingSong?.coverDataUrl || null,
    bpm,
    durationMs: editorDurationMs,
    items: editorItems,
    recordPath,
    audioDataUrl: editorAudioDataUrl,
    audioName: editorAudioName
  }
  const existingIndex = songs.findIndex((song) => song.id === nowSong.id)
  if (existingIndex >= 0) songs[existingIndex] = nowSong
  else songs.unshift(nowSong)
  saveSongs().then(() => {
    renderSongSelect()
    renderSongList()
    editorSongId = nowSong.id
    selectedSongId = nowSong.id
    currentSong = nowSong
    updateSelectedSong()
  })
}

async function removeSong(songId) {
  songs = songs.filter((song) => song.id !== songId)
  await deleteSongById(songId)
  // Only persist non-folder songs to filesystem (same filter as saveSongs)
  const persistSongs = songs.filter((song) => song.source !== "folder")
  await writeSongsToFileSystem(persistSongs)
  renderSongSelect()
  renderSongList()
  if (selectedSongId === songId) {
    selectedSongId = songs[0]?.id ?? null
    updateSelectedSong()
  }
  if (editorSongId === songId) {
    createNewSong()
  }
}

// 导出曲目为 zip 文件供分享
async function exportSongAsZip(songId) {
  const song = songs.find((item) => item.id === songId)
  if (!song) return
  if (typeof JSZip === "undefined") {
    alert("JSZip 库未加载, 无法导出")
    return
  }
  const zip = new JSZip()
  const folderName = (song.name || "song").replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, "_")
  const folder = zip.folder(folderName)
  const chart = {
    name: song.name,
    artist: song.artist || "",
    album: song.album || "",
    bpm: song.bpm,
    durationMs: song.durationMs,
    items: song.items || [],
    recordPath: song.recordPath || []
  }
  // Include cover image
  if (song.coverDataUrl && song.coverDataUrl.startsWith("data:")) {
    chart.cover = "cover.jpg"
    const coverBase64 = song.coverDataUrl.split(",")[1]
    const coverBinary = atob(coverBase64)
    const coverBytes = new Uint8Array(coverBinary.length)
    for (let i = 0; i < coverBinary.length; i++) {
      coverBytes[i] = coverBinary.charCodeAt(i)
    }
    folder.file("cover.jpg", coverBytes)
  }
  folder.file("chart.json", JSON.stringify(chart, null, 2))
  let audioFileName = ""
  if (song.audioDataUrl && song.audioDataUrl.startsWith("data:")) {
    const mimeMatch = song.audioDataUrl.match(/^data:(audio\/[^;]+);base64,/)
    const mime = mimeMatch ? mimeMatch[1] : "audio/mpeg"
    const ext = mime.split("/")[1] === "mpeg" ? "mp3" : mime.split("/")[1]
    audioFileName = `audio.${ext}`
    const base64 = song.audioDataUrl.split(",")[1]
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    folder.file(audioFileName, bytes)
  }
  // 生成 index 片段提示
  const indexSnippet = { folder: folderName, audio: audioFileName }
  folder.file("README.txt",
    `将此文件夹放入项目的 songs/ 目录下，\n然后在 songs/index.json 的 packs 数组中添加：\n${JSON.stringify(indexSnippet, null, 2)}\n`
  )
  const blob = await zip.generateAsync({ type: "blob" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `${folderName}.zip`
  link.click()
  URL.revokeObjectURL(url)
}

function showView(viewId) {
  activeViewId = viewId
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === viewId)
  })
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewId)
  })
  window.scrollTo(0, 0)
}

function handleAudioInput(event) {
  const file = event.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const dataUrl = reader.result
    setAudioMeta(file.name, dataUrl)
  }
  reader.readAsDataURL(file)
}

function bindEvents() {
  toolSelect.addEventListener("change", () => {
    setTool(toolSelect.value)
  })
  bpmInput.addEventListener("change", () => {
    bpm = Math.max(60, Math.min(200, Number(bpmInput.value) || 120))
    beatMs = 60000 / bpm
    refreshChartArea()
  })
  startButton.addEventListener("click", () => {
    if (gameState === "paused") resumeGame()
    else startGame()
  })
  pauseButton.addEventListener("click", pauseGame)
  resetButton.addEventListener("click", resetGame)
  playAudioButton.addEventListener("click", () => {
    const startMs = editorCursorMs || 0
    playAudio(startMs)
    editorPreviewPlaying = true
    editorPreviewStartTime = performance.now()
  })
  stopAudioButton.addEventListener("click", () => {
    stopAudio()
    if (editorPreviewPlaying) {
      editorCursorMs = editorCursorMs + (performance.now() - editorPreviewStartTime)
      editorPreviewPlaying = false
      renderTimelines()
    }
  })
  primaryStart.addEventListener("click", () => showView("gameSetupView"))
  primaryEditor.addEventListener("click", () => showView("editorView"))
  openEditorFromSetup.addEventListener("click", () => showView("editorView"))
  launchGameButton.addEventListener("click", () => {
    if (!currentSong) return
    playingTitle.textContent = currentSong.name
    playingMeta.textContent = `${currentSong.bpm} BPM · ${Math.round(currentSong.durationMs / 1000)}s`
    showView("gameView")
    enterReadyState()
  })
  saveSongButton.addEventListener("click", saveSongFromEditor)
  loadSongButton.addEventListener("click", () => loadSongToEditor(songSelect.value))
  newSongButton.addEventListener("click", createNewSong)
  autoGenerateButton.addEventListener("click", autoGenerateChart)
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view))
  })
  editorCanvas.addEventListener("click", handleEditorClick)
  // Draggable cursor on record timeline
  recordCanvas.addEventListener("pointerdown", (event) => {
    handleTimelineCursorDown(event, recordCanvas)
  })
  recordCanvas.addEventListener("pointermove", handleTimelineCursorMove)
  recordCanvas.addEventListener("pointerup", handleTimelineCursorUp)
  // Draggable cursor on editor timeline (Ctrl+click to avoid conflict with item placement)
  editorCanvas.addEventListener("pointerdown", (event) => {
    if (event.ctrlKey || event.metaKey) {
      handleTimelineCursorDown(event, editorCanvas)
    }
  })
  editorCanvas.addEventListener("pointermove", handleTimelineCursorMove)
  editorCanvas.addEventListener("pointerup", handleTimelineCursorUp)
  audioInput.addEventListener("change", handleAudioInput)
  gestureStartToggle.addEventListener("change", async () => {
    gestureStartEnabled = gestureStartToggle.checked
    if (gestureStartEnabled) {
      poseStatus.textContent = "正在请求摄像头权限..."
      console.log("[Camera] 手势开关打开，请求摄像头...")
      try {
        // Step 1: Request camera permission first (this triggers the browser prompt)
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true })
        // Got permission — stop temp stream immediately
        tempStream.getTracks().forEach(t => t.stop())
        console.log("[Camera] 权限已获取")

        // Step 2: Now enumerate with full device info (labels + IDs)
        await enumerateCameras()
        console.log("[Camera] 设备列表:", cameraSelect.options.length, "个摄像头")

        // Step 3: Start with selected (or first) camera
        if (cameraSelect.value) {
          poseStatus.textContent = "正在启动摄像头..."
          await startPoseCamera(cameraSelect.value)
        } else {
          // Fallback: try without specific device
          poseStatus.textContent = "正在启动摄像头..."
          await startPoseCamera(null)
        }
      } catch (error) {
        console.error("[Camera] 启动失败:", error)
        if (error.name === "NotAllowedError") {
          poseStatus.textContent = "⚠ 摄像头权限被拒绝，请点击地址栏🔒图标允许"
        } else if (error.name === "NotFoundError") {
          poseStatus.textContent = "未找到摄像头设备"
        } else if (error.name === "NotReadableError") {
          poseStatus.textContent = "摄像头被其他程序占用"
        } else {
          poseStatus.textContent = "摄像头错误: " + error.message
        }
        gestureStartToggle.checked = false
        gestureStartEnabled = false
      }
    } else {
      poseStatus.textContent = "手势：关闭"
      console.log("[Camera] 手势开关关闭，释放摄像头")
      if (poseStream) {
        poseStream.getTracks().forEach((track) => track.stop())
        poseStream = null
      }
      if (poseCamera) {
        poseCamera.stop()
        poseCamera = null
      }
    }
  })
  poseCanvas.addEventListener("pointerdown", (event) => {
    const rect = poseCanvas.getBoundingClientRect()
    const y = ((event.clientY - rect.top) / rect.height) * poseCanvas.height
    const topY = poseLineTop * poseCanvas.height
    const bottomY = poseLineBottom * poseCanvas.height
    if (Math.abs(y - topY) < 12) {
      poseDragging = "top"
    } else if (Math.abs(y - bottomY) < 12) {
      poseDragging = "bottom"
    }
    if (poseDragging) {
      poseCanvas.setPointerCapture(event.pointerId)
      updatePoseLineByPointer(event)
    }
  })
  poseCanvas.addEventListener("pointermove", (event) => {
    if (!poseDragging) return
    updatePoseLineByPointer(event)
  })
  poseCanvas.addEventListener("pointerup", (event) => {
    if (!poseDragging) return
    poseDragging = null
    poseCanvas.releasePointerCapture(event.pointerId)
  })
  poseCanvas.addEventListener("pointerleave", () => {
    poseDragging = null
  })
  restartButton.addEventListener("click", () => {
    clearGameOver()
    enterReadyState()
  })
  backToEditorButton.addEventListener("click", () => {
    clearGameOver()
    resetGame()
    showView("editorView")
  })
  // Camera is fully managed by the gesture toggle — no separate refresh/select handlers needed
  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase()
    if (activeViewId === "gameView") {
      if (gameState === "gameover") return
      if (key === " " && !event.repeat) {
        event.preventDefault()
        if (gameState === "playing") pauseGame()
        else if (gameState === "paused") resumeGame()
        else if (gameState === "ready") launchFromReady()
        else enterReadyState()
        return
      }
      if (["w", "s", "x"].includes(key)) {
        moveLaneBy(key)
      }
      if (key === "arrowup") moveLaneBy("w")
      if (key === "arrowdown") moveLaneBy("x")
    }
    if (activeViewId === "editorView") {
      if (key === "q" && !event.repeat) {
        if (event.shiftKey) {
          // Shift+Q = overwrite mode
          if (!recording) startOverwriteRecording()
          else if (recordingPaused) resumeOverwriteRecording()
          else pauseRecording()
        } else {
          // Q = safe mode (preview + append)
          if (!recording) startRecording()
          else if (recordingPaused) resumeRecording()
          else pauseRecording()
        }
        return
      }
      if (key === "escape" && recording) {
        stopRecording()
        return
      }
      if (recordingPaused && (key === "arrowleft" || key === "arrowright")) {
        const step = event.shiftKey ? 5000 : 1000
        seekRecording(key === "arrowleft" ? -step : step)
        return
      }
      if (["w", "s", "x"].includes(key)) {
        moveLaneBy(key)
      }
    }
  })
}

function isInvincible() {
  return performance.now() < invincibleUntil
}

function isPowered() {
  return performance.now() < powerUntil
}

function runUnitTests() {
  const results = []
  const assert = (name, condition) => {
    results.push({ name, passed: Boolean(condition) })
  }
  assert("estimateBpmFromOnsets 120", estimateBpmFromOnsets([0, 500, 1000, 1500]) === 120)
  const originalTop = poseLineTop
  const originalBottom = poseLineBottom
  poseLineTop = 0.3
  poseLineBottom = 0.7
  const makeLandmarks = (wristY, shoulderY, hipY, spread) => {
    const list = Array.from({ length: 33 }, () => ({
      x: 0.5,
      y: 0.5,
      visibility: 1
    }))
    list[11] = { x: 0.4, y: shoulderY, visibility: 1 }
    list[12] = { x: 0.6, y: shoulderY, visibility: 1 }
    list[23] = { x: 0.4, y: hipY, visibility: 1 }
    list[24] = { x: 0.6, y: hipY, visibility: 1 }
    list[15] = { x: 0.5 - spread / 2, y: wristY, visibility: 1 }
    list[16] = { x: 0.5 + spread / 2, y: wristY, visibility: 1 }
    return list
  }
  assert("determinePoseLane up", determinePoseLane(makeLandmarks(0.2, 0.4, 0.8, 0.2)) === 0)
  assert("determinePoseLane mid", determinePoseLane(makeLandmarks(0.5, 0.4, 0.8, 0.2)) === 1)
  assert("determinePoseLane down", determinePoseLane(makeLandmarks(0.9, 0.4, 0.8, 0.2)) === 2)
  poseLineTop = originalTop
  poseLineBottom = originalBottom
  console.table(results)
  return results.every((item) => item.passed)
}

function updateRecordingTrail() {
  updateRecording()
  if (recording) {
    renderTimelines()
  }
}

function loop() {
  if (activeViewId === "gameView") {
    updateGame()
  }
  if (recording && !recordingPaused) {
    updateRecordingTrail()
  } else if (recordingPaused) {
    renderTimelines()
  } else if (editorPreviewPlaying) {
    // Update cursor during preview playback
    const elapsed = editorCursorMs + (performance.now() - editorPreviewStartTime)
    const maxMs = audioBuffer ? audioBuffer.duration * 1000 : editorDurationMs
    if (elapsed >= maxMs) {
      editorCursorMs = maxMs
      editorPreviewPlaying = false
      stopAudio()
    }
    renderTimelines()
  }
  requestAnimationFrame(loop)
}

async function init() {
  setupPose()
  await loadSongs()
  renderSongList()
  renderSongSelect()
  selectedSongId = songs[0]?.id ?? null
  updateSelectedSong()
  loadSongToEditor(selectedSongId)
  refreshChartArea()
  renderTimelines()
  bindEvents()
  setTool("pellet")
  resetGameState()
  showView("homeView")
  gestureStartEnabled = gestureStartToggle.checked
  poseStatus.textContent = gestureStartEnabled ? "手势：待机" : "手势：关闭"
  bpmStatus.textContent = editorAudioDataUrl ? "BPM 计算中..." : "等待音频"
  // Only enumerate cameras (populate dropdown), don't auto-start
  // Camera will start when user enables the gesture toggle
  enumerateCameras()
  if (navigator.mediaDevices?.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", enumerateCameras)
  }
  if (new URLSearchParams(window.location.search).has("test")) {
    runUnitTests()
  }
  loop()
}

init()
