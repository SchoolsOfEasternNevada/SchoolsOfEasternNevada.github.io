class TimeWarp {
  constructor({ lineWidth, lineColour, speed, videoCanvas, videoCtx, video, imageCanvas, imageCtx }) {
    if (videoCanvas.tagName !== "CANVAS" || imageCanvas.tagName !== "CANVAS") {
      throw new Error("VideoCanvas and ImageCanvas must be a canvas component")
    }

    this.videoCanvas = videoCanvas
    this.videoCtx = videoCtx
    this.video = video
    this.imageCanvas = imageCanvas
    this.imageCtx = imageCtx
    this.lineWidth = lineWidth // Width of the line
    this.lineColour = lineColour
    this.speed = speed // Speed of the line in pixels per frame
    this.sidewaysMode = false // false = vertical warp (line down), true = horizontal warp (line sideways)
    // native properties
    this.linePos = 0 // Current position of the line
    this.imageChunks = [] // Array to store the generated image chunks - {imgData: ImageData, height: number}[] or {imgData: ImageData, x: number}[]
    this.animationId = null // ID of the animation frame - null | number

    // Bind animate method to the class instance
    this.animate = this.animate.bind(this)
  }

  toggleSideways() {
    this.sidewaysMode = !this.sidewaysMode
    return this.sidewaysMode
  }

  animate() {
    this.videoCtx.save() // Save the current canvas state
    this.videoCtx.scale(-1, 1) // Invert horizontally (mirror effect)
    this.videoCtx.drawImage(this.video, -this.videoCanvas.width, 0) // Draw the inverted video horizontally
    // reset the transform-matrix
    this.videoCtx.setTransform(1, 0, 0, 1, 0, 0)

    if (this.sidewaysMode) {
      // Sideways warp: vertical line moving right, vertical chunks
      this.imageChunks.forEach((chunk) => {
        this.imageCtx.putImageData(chunk.imgData, chunk.x, 0)
      })
      this.videoCtx.beginPath()
      this.videoCtx.lineWidth = this.lineWidth
      this.videoCtx.strokeStyle = this.lineColour
      this.videoCtx.moveTo(this.linePos, 0)
      this.videoCtx.lineTo(this.linePos, this.videoCanvas.height)
      this.videoCtx.stroke()

      const chunkWidth = 0.25 + this.lineWidth
      if (this.linePos % chunkWidth <= this.speed) {
        const currentChunkIndex = Math.floor(this.linePos / chunkWidth)
        const imgData = this.videoCtx.getImageData(currentChunkIndex * chunkWidth + this.lineWidth, 0, chunkWidth, this.videoCanvas.height)
        this.imageChunks.push({ imgData, x: this.linePos - chunkWidth + this.lineWidth })
      }

      this.linePos += this.speed
      if (this.linePos >= this.videoCanvas.width + this.lineWidth) cancelAnimationFrame(this.animationId)
      else this.animationId = requestAnimationFrame(this.animate)
    } else {
      // Vertical warp: horizontal line moving down, horizontal chunks
      this.imageChunks.forEach((chunk) => {
        this.imageCtx.putImageData(chunk.imgData, 0, chunk.height)
      })
      this.videoCtx.beginPath()
      this.videoCtx.lineWidth = this.lineWidth
      this.videoCtx.strokeStyle = this.lineColour
      this.videoCtx.moveTo(0, this.linePos)
      this.videoCtx.lineTo(this.videoCanvas.width, this.linePos)
      this.videoCtx.stroke()

      const chunkHeight = 0.25 + this.lineWidth // Set chunkHeight *use as pixel*
      if (this.linePos % chunkHeight <= this.speed) {
        const currentChunkIndex = Math.floor(this.linePos / chunkHeight)
        const imgData = this.videoCtx.getImageData(0, currentChunkIndex * chunkHeight + this.lineWidth, this.videoCanvas.width, chunkHeight)
        this.imageChunks.push({ imgData, height: this.linePos - chunkHeight + this.lineWidth })
      }

      this.linePos += this.speed
      if (this.linePos >= this.videoCanvas.height + this.lineWidth) cancelAnimationFrame(this.animationId)
      else this.animationId = requestAnimationFrame(this.animate)
    }
  }

  reset() {
    // Reset animation
    cancelAnimationFrame(this.animationId)
    this.videoCtx.clearRect(0, 0, this.videoCanvas.width, this.videoCanvas.height)
    this.imageCtx.clearRect(0, 0, this.videoCanvas.width, this.videoCanvas.height)
    this.linePos = 0
    this.speed = 1
    this.imageChunks = []
    setTimeout(() => {
      this.animate()
    }, 0.5 * 1000)
  }

  download() {
    const a = document.createElement("a")
    a.download = "yourQueerImage.png"
    a.href = this.imageCanvas.toDataURL("image/png")
    a.click()
  }
}
