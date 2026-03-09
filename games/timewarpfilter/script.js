const canvasArea = document.querySelector(".canvas-area")
const canvas = document.querySelector("#canvas")
const ctx = canvas.getContext("2d", { willReadFrequently: true })
const imageCanvas = document.querySelector("#imageCanvas")
const imageCtx = imageCanvas.getContext("2d")
const video = document.createElement("video")
const resetButton = document.querySelector("#reset-button")
const downloadButton = document.querySelector("#download-button")
const sidewaysToggle = document.querySelector("#sideways-toggle")

const $Effect = new TimeWarp({
  lineWidth: 3,
  lineColour: "#00FFFFFF",
  speed: 1,
  videoCanvas: canvas,
  videoCtx: ctx,
  video,
  imageCanvas: imageCanvas,
  imageCtx: imageCtx,
})

const $Devices = new Devices({
  selectEl: document.getElementById("deviceList"),
  constraints: {
    video: {
      facingMode: { ideal: "environment" },
      codec: "h264",
    },
  },
  getUserMediaSuccess: (stream) => {
    canvasArea.classList.remove("blocked")
    video.srcObject = stream
    video.play()
    video.addEventListener("loadedmetadata", () => {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      imageCanvas.width = video.videoWidth
      imageCanvas.height = video.videoHeight
      $Effect.animate()
    })
  },
  getUserMediaError: (error) => {
    canvasArea.classList.add("blocked")
  },
})

$Devices.onChange(() => {
  $Effect.reset()
})

resetButton.addEventListener("click", () => {
  $Effect.reset()
})
downloadButton.addEventListener("click", () => {
  $Effect.download()
})
sidewaysToggle.addEventListener("click", () => {
  const isOn = $Effect.toggleSideways()
  sidewaysToggle.textContent = isOn ? "Vertical Warp" : "Sideways Warp"
  $Effect.reset()
})
