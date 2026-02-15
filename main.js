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
const clearButton = document.getElementById("clearButton")
const exportButton = document.getElementById("exportButton")
const importButton = document.getElementById("importButton")
const songNameInput = document.getElementById("songNameInput")
const saveSongButton = document.getElementById("saveSongButton")
const songSelect = document.getElementById("songSelect")
const loadSongButton = document.getElementById("loadSongButton")
const newSongButton = document.getElementById("newSongButton")
const deleteSongButton = document.getElementById("deleteSongButton")
const songList = document.getElementById("songList")
const launchGameButton = document.getElementById("launchGameButton")
const selectedSongTitle = document.getElementById("selectedSongTitle")
const selectedSongMeta = document.getElementById("selectedSongMeta")
const playingTitle = document.getElementById("playingTitle")
const playingMeta = document.getElementById("playingMeta")
const primaryStart = document.getElementById("primaryStart")
const primaryEditor = document.getElementById("primaryEditor")
const openEditorFromSetup = document.getElementById("openEditorFromSetup")
const autoBpmButton = document.getElementById("autoBpmButton")
const recordButton = document.getElementById("recordButton")
const stopRecordButton = document.getElementById("stopRecordButton")
const recordCanvas = document.getElementById("recordCanvas")
const editorCanvas = document.getElementById("editorCanvas")
const audioInput = document.getElementById("audioInput")
const audioName = document.getElementById("audioName")
const cameraSelect = document.getElementById("cameraSelect")
const refreshCameraButton = document.getElementById("refreshCameraButton")
const poseVideo = document.getElementById("poseVideo")
const poseCanvas = document.getElementById("poseCanvas")

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
let recordStartTime = 0
let recordLastSample = 0
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
  if (typeof Pose === "undefined") return
  pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
  })
  pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6
  })
  pose.onResults(onPoseResults)
}

async function enumerateCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) return
  const devices = await navigator.mediaDevices.enumerateDevices()
  const cameras = devices.filter((device) => device.kind === "videoinput")
  cameraSelect.innerHTML = ""
  cameras.forEach((camera, index) => {
    const option = document.createElement("option")
    option.value = camera.deviceId
    option.textContent = camera.label || `摄像头 ${index + 1}`
    cameraSelect.appendChild(option)
  })
  if (!cameraSelect.value && cameras[0]) {
    cameraSelect.value = cameras[0].deviceId
  }
}

async function startPoseCamera(deviceId) {
  if (!navigator.mediaDevices?.getUserMedia || !pose) return
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
  poseCamera = new Camera(poseVideo, {
    onFrame: async () => {
      await pose.send({ image: poseVideo })
    },
    width: 640,
    height: 360
  })
  poseCamera.start()
}

function determinePoseLane(landmarks) {
  const leftWrist = landmarks[15]
  const rightWrist = landmarks[16]
  const leftShoulder = landmarks[11]
  const rightShoulder = landmarks[12]
  const leftHip = landmarks[23]
  const rightHip = landmarks[24]
  if (
    leftWrist.visibility < 0.5 ||
    rightWrist.visibility < 0.5 ||
    leftShoulder.visibility < 0.4 ||
    rightShoulder.visibility < 0.4 ||
    leftHip.visibility < 0.4 ||
    rightHip.visibility < 0.4
  ) {
    return null
  }
  const wristY = (leftWrist.y + rightWrist.y) * 0.5
  const shoulderY = (leftShoulder.y + rightShoulder.y) * 0.5
  const hipY = (leftHip.y + rightHip.y) * 0.5
  const torso = Math.max(0.001, hipY - shoulderY)
  const wristSpread = Math.abs(leftWrist.x - rightWrist.x)
  const relative = (wristY - shoulderY) / torso
  if (relative < -0.18) return 0
  if (relative > 0.55) return 2
  if (wristSpread > 0.32 && relative > -0.15 && relative < 0.45) return 1
  if (relative > 0.3) return 2
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

function onPoseResults(results) {
  if (!poseCanvas || !poseVideo) return
  const width = poseVideo.videoWidth || 640
  const height = poseVideo.videoHeight || 360
  poseCanvas.width = width
  poseCanvas.height = height
  const poseCtx = poseCanvas.getContext("2d")
  poseCtx.save()
  poseCtx.clearRect(0, 0, width, height)
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
  }
  poseCtx.restore()
}

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)()
  }
  return audioContext
}

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: "id" })
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

function stopAudio() {
  if (audioSource) {
    audioSource.stop()
    audioSource.disconnect()
    audioSource = null
  }
}

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
  const ctx = getAudioContext()
  const response = await fetch(dataUrl)
  const buffer = await response.arrayBuffer()
  audioBuffer = await ctx.decodeAudioData(buffer)
  return audioBuffer
}

function setAudioMeta(name, dataUrl) {
  editorAudioName = name || "未选择音频"
  audioName.textContent = editorAudioName
  editorAudioDataUrl = dataUrl || null
  if (!dataUrl) {
    audioBuffer = null
    return
  }
  decodeAudio(dataUrl).then(() => {
    updateEditorDuration()
    refreshChartArea()
    renderTimelines()
  })
}

function updateEditorDuration() {
  const audioMs = audioBuffer ? audioBuffer.duration * 1000 : 0
  const lastItem = editorItems.reduce((max, item) => Math.max(max, item.time), 0)
  const lastRecord = recordPath.reduce((max, point) => Math.max(max, point.time), 0)
  editorDurationMs = Math.max(30000, audioMs, lastItem + 2000, lastRecord + 2000)
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
  document.querySelectorAll(".tool-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === tool)
  })
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
  updateHud()
}

function startGame() {
  if (!currentSong) return
  if (gameState === "playing") return
  resetGameState()
  objects = buildObjectsFromItems(currentSong.items)
  bpm = currentSong.bpm
  beatMs = 60000 / bpm
  startTime = performance.now()
  audioOffsetMs = 0
  gameState = "playing"
  setStatus("节奏进行中")
  playAudio(0)
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
}

function drawTrack() {
  ctx.fillStyle = "#05070f"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  for (let lane = 0; lane < lanes; lane += 1) {
    const y = laneToY(lane)
    ctx.strokeStyle = lane === 1 ? "rgba(120,150,255,0.7)" : "rgba(60,75,130,0.6)"
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(80, y)
    ctx.lineTo(canvas.width - 40, y)
    ctx.stroke()
  }
  ctx.strokeStyle = "rgba(255,255,255,0.12)"
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(pacmanX, 20)
  ctx.lineTo(pacmanX, canvas.height - 20)
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
  const angle = pacman.mouth
  ctx.translate(pacmanX, pacman.y)
  ctx.fillStyle = "#ffe559"
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.arc(0, 0, pacmanRadius, angle, Math.PI * 2 - angle)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function drawObject(object, x) {
  const y = laneToY(object.lane)
  if (object.type === "pellet") {
    ctx.fillStyle = "#ffd36a"
    ctx.beginPath()
    ctx.arc(x, y, 10, 0, Math.PI * 2)
    ctx.fill()
  } else if (object.type === "power") {
    ctx.fillStyle = "#7ef2ff"
    ctx.beginPath()
    ctx.arc(x, y, 14, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = "rgba(126, 242, 255, 0.6)"
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(x, y, 18, 0, Math.PI * 2)
    ctx.stroke()
  } else if (object.type === "ghost") {
    const powered = isPowered()
    const pulse = powered ? 0.6 + 0.4 * Math.sin(performance.now() / 180) : 1
    ctx.save()
    ctx.fillStyle = powered ? `rgba(107, 214, 255, ${pulse})` : "#ff507b"
    ctx.shadowColor = powered ? "rgba(107, 214, 255, 0.6)" : "transparent"
    ctx.shadowBlur = powered ? 12 : 0
    ctx.beginPath()
    ctx.arc(x, y - 6, 14, Math.PI, 0)
    ctx.lineTo(x + 14, y + 12)
    ctx.lineTo(x - 14, y + 12)
    ctx.closePath()
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.fillStyle = powered ? "rgba(255,255,255,0.9)" : "#fff"
    ctx.beginPath()
    ctx.arc(x - 5, y - 2, 4, 0, Math.PI * 2)
    ctx.arc(x + 5, y - 2, 4, 0, Math.PI * 2)
    ctx.fill()
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
          score += pelletScore + combo * 2
        }
      } else if (object.type === "power") {
        if (pacman.targetLane === object.lane) {
          object.collected = true
          pellets += 1
          combo += 1
          powerUntil = now + powerDuration
          score += 20 + combo * 2
          setStatus("大力丸！10 秒可吃幽灵")
        }
      } else if (object.type === "ghost") {
        if (pacman.targetLane === object.lane && !object.hit) {
          object.hit = true
          if (isPowered()) {
            object.collected = true
            combo += 1
            score += 40 + combo * 2
            setStatus("吃掉幽灵")
          } else if (isInvincible()) {
            return
          } else {
            combo = 0
            lives -= 1
            invincibleUntil = now + invincibleDuration
            score = Math.max(0, score - 50)
            if (lives <= 0) {
              gameState = "gameover"
              setStatus("对决失败，按空格重新开始")
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
  drawTrack()
  drawPacman()
  if (gameState !== "playing") {
    updateHud()
    return
  }
  const elapsed = performance.now() - startTime
  updateObjects(elapsed)
  updateHud()
  const durationMs = currentSong?.durationMs ?? editorDurationMs
  const finished = objects.every((object) => object.passed || object.collected || object.hit)
  if (finished && elapsed > durationMs + leadTime) {
    gameState = "idle"
    setStatus("节奏结束")
    stopAudio()
  }
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
  recordPath = []
  recordStartTime = performance.now()
  recordLastSample = 0
  setStatus("录制中")
  playAudio(0)
}

function stopRecording() {
  if (!recording) return
  recording = false
  stopAudio()
  setStatus("录制结束")
  refreshChartArea()
  renderTimelines()
}

function updateRecording() {
  if (!recording) return
  const now = performance.now()
  const time = now - recordStartTime
  if (audioBuffer && time >= audioBuffer.duration * 1000) {
    stopRecording()
    return
  }
  if (time - recordLastSample > 40) {
    recordPath.push({
      time,
      lane: pacman.targetLane
    })
    recordLastSample = time
    const recordContainer = recordCanvas.parentElement
    const editorContainer = editorCanvas.parentElement
    scrollTimelineToTime(recordContainer, time)
    scrollTimelineToTime(editorContainer, time)
  }
  if (time > editorDurationMs - 1000) {
    editorDurationMs = time + 2000
  }
}

async function saveSongs() {
  await Promise.all(songs.map((song) => putSong(song)))
}

async function loadSongs() {
  try {
    songs = await getAllSongs()
  } catch (error) {
    songs = []
  }
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
    await saveSongs()
  }
}

function renderSongList() {
  songList.innerHTML = ""
  songs.forEach((song) => {
    const card = document.createElement("div")
    card.className = "song-card"
    if (song.id === selectedSongId) card.classList.add("selected")
    const title = document.createElement("div")
    title.className = "song-title"
    title.textContent = song.name
    const meta = document.createElement("div")
    meta.className = "song-meta"
    const duration = Math.round((song.durationMs || 0) / 1000)
    meta.textContent = `${song.bpm} BPM · ${duration}s`
    card.appendChild(title)
    card.appendChild(meta)
    const actionRow = document.createElement("div")
    actionRow.className = "song-actions"
    const deleteButton = document.createElement("button")
    deleteButton.className = "text-button"
    deleteButton.textContent = "删除"
    deleteButton.addEventListener("click", async (event) => {
      event.stopPropagation()
      await removeSong(song.id)
    })
    actionRow.appendChild(deleteButton)
    card.appendChild(actionRow)
    card.addEventListener("click", () => {
      selectedSongId = song.id
      updateSelectedSong()
      renderSongList()
    })
    songList.appendChild(card)
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
  selectedSongMeta.textContent = `${song.bpm} BPM · ${Math.round(song.durationMs / 1000)}s`
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
  const nowSong = {
    id: editorSongId || String(Date.now()),
    name,
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
  putSong(nowSong).then(() => {
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

function showView(viewId) {
  activeViewId = viewId
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === viewId)
  })
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewId)
  })
}

function autoDetectBpm() {
  if (!recordPath.length) return
  const changes = []
  for (let i = 1; i < recordPath.length; i += 1) {
    if (recordPath[i].lane !== recordPath[i - 1].lane) {
      changes.push(recordPath[i].time)
    }
  }
  if (changes.length < 2) return
  const intervals = []
  for (let i = 1; i < changes.length; i += 1) {
    intervals.push(changes[i] - changes[i - 1])
  }
  const avg = intervals.reduce((sum, value) => sum + value, 0) / intervals.length
  const bpmValue = Math.round(60000 / avg)
  bpm = Math.max(60, Math.min(200, bpmValue))
  beatMs = 60000 / bpm
  bpmInput.value = String(bpm)
  refreshChartArea()
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
  document.querySelectorAll(".tool-button").forEach((button) => {
    button.addEventListener("click", () => setTool(button.dataset.tool))
  })
  bpmInput.addEventListener("change", () => {
    bpm = Math.max(60, Math.min(200, Number(bpmInput.value) || 120))
    beatMs = 60000 / bpm
    refreshChartArea()
  })
  clearButton.addEventListener("click", () => {
    editorItems = []
    refreshChartArea()
    renderTimelines()
  })
  exportButton.addEventListener("click", refreshChartArea)
  importButton.addEventListener("click", loadChartFromText)
  startButton.addEventListener("click", () => {
    if (gameState === "paused") resumeGame()
    else startGame()
  })
  pauseButton.addEventListener("click", pauseGame)
  resetButton.addEventListener("click", resetGame)
  primaryStart.addEventListener("click", () => showView("gameSetupView"))
  primaryEditor.addEventListener("click", () => showView("editorView"))
  openEditorFromSetup.addEventListener("click", () => showView("editorView"))
  launchGameButton.addEventListener("click", () => {
    if (!currentSong) return
    playingTitle.textContent = currentSong.name
    playingMeta.textContent = `${currentSong.bpm} BPM · ${Math.round(currentSong.durationMs / 1000)}s`
    showView("gameView")
    startGame()
  })
  saveSongButton.addEventListener("click", saveSongFromEditor)
  loadSongButton.addEventListener("click", () => loadSongToEditor(songSelect.value))
  newSongButton.addEventListener("click", createNewSong)
  deleteSongButton.addEventListener("click", async () => {
    if (editorSongId) {
      await removeSong(editorSongId)
    }
  })
  autoBpmButton.addEventListener("click", autoDetectBpm)
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view))
  })
  recordButton.addEventListener("click", startRecording)
  stopRecordButton.addEventListener("click", stopRecording)
  editorCanvas.addEventListener("click", handleEditorClick)
  audioInput.addEventListener("change", handleAudioInput)
  refreshCameraButton.addEventListener("click", async () => {
    await enumerateCameras()
    if (cameraSelect.value) {
      startPoseCamera(cameraSelect.value)
    }
  })
  cameraSelect.addEventListener("change", () => {
    if (cameraSelect.value) {
      startPoseCamera(cameraSelect.value)
    }
  })
  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase()
    if (activeViewId === "gameView") {
      if (key === " ") {
        if (gameState === "playing") pauseGame()
        else if (gameState === "paused") resumeGame()
        else startGame()
        return
      }
      if (["w", "s", "x"].includes(key)) {
        moveLaneBy(key)
      }
      if (key === "arrowup") moveLaneBy("w")
      if (key === "arrowdown") moveLaneBy("x")
    }
    if (activeViewId === "editorView") {
      if (key === "s" && !event.repeat) {
        if (!recording) startRecording()
        else stopRecording()
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

function updateRecordingTrail() {
  updateRecording()
  if (recording) {
    renderTimelines()
  }
}

function loop() {
  updateGame()
  updateRecordingTrail()
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
  enumerateCameras().then(() => {
    if (cameraSelect.value) {
      startPoseCamera(cameraSelect.value)
    }
  })
  if (navigator.mediaDevices?.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", enumerateCameras)
  }
  loop()
}

init()
