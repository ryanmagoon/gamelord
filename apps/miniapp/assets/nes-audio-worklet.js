const BUFFER_CAPACITY = 8192;
const START_THRESHOLD = 1024;

class GameLordNesAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.left = new Float32Array(BUFFER_CAPACITY);
    this.right = new Float32Array(BUFFER_CAPACITY);
    this.readPosition = 0;
    this.writePosition = 0;
    this.sampleCount = 0;
    this.ready = false;

    this.port.onmessage = ({ data }) => {
      if (data?.type !== "samples") {
        return;
      }
      const incomingLeft = data.left;
      const incomingRight = data.right;
      const length = incomingLeft.length;
      const overflow = Math.max(0, this.sampleCount + length - BUFFER_CAPACITY);
      this.readPosition = (this.readPosition + overflow) % BUFFER_CAPACITY;
      this.sampleCount -= overflow;

      for (let index = 0; index < length; index += 1) {
        this.left[this.writePosition] = incomingLeft[index];
        this.right[this.writePosition] = incomingRight[index];
        this.writePosition = (this.writePosition + 1) % BUFFER_CAPACITY;
      }
      this.sampleCount += length;
      if (!this.ready && this.sampleCount >= START_THRESHOLD) {
        this.ready = true;
      }
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length < 2) {
      return true;
    }

    const outputLeft = output[0];
    const outputRight = output[1];
    if (!this.ready) {
      outputLeft.fill(0);
      outputRight.fill(0);
      return true;
    }

    const available = Math.min(outputLeft.length, this.sampleCount);
    for (let index = 0; index < available; index += 1) {
      outputLeft[index] = this.left[this.readPosition];
      outputRight[index] = this.right[this.readPosition];
      this.readPosition = (this.readPosition + 1) % BUFFER_CAPACITY;
    }
    for (let index = available; index < outputLeft.length; index += 1) {
      outputLeft[index] = 0;
      outputRight[index] = 0;
    }
    this.sampleCount -= available;

    if (available < outputLeft.length) {
      this.ready = false;
      this.port.postMessage({ type: "underrun" });
    }
    return true;
  }
}

registerProcessor("gamelord-nes-audio", GameLordNesAudioProcessor);
