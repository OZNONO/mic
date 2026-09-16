export class KoreanSpeechRecognition {
  constructor({ onText, onError } = {}) {
    this.RecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.onText = onText;
    this.onError = onError;
    this.recognition = null;
    this.finalText = "";
    this.interimText = "";
    this.running = false;
  }

  get supported() {
    return Boolean(this.RecognitionClass);
  }

  start() {
    this.abort();
    this.finalText = "";
    this.interimText = "";
    if (!this.supported) return false;

    try {
      this.recognition = new this.RecognitionClass();
      this.recognition.lang = "ko-KR";
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 1;

      this.recognition.onresult = (event) => {
        let interim = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const text = event.results[index][0].transcript;
          if (event.results[index].isFinal) this.finalText += `${text} `;
          else interim += text;
        }
        this.interimText = interim;
        this.onText?.(this.getText(), Boolean(interim));
      };

      this.recognition.onerror = (event) => {
        if (event.error !== "aborted" && event.error !== "no-speech") this.onError?.(event.error);
      };
      this.recognition.onend = () => { this.running = false; };
      this.recognition.start();
      this.running = true;
      return true;
    } catch (error) {
      console.warn("음성 인식을 시작하지 못했습니다.", error);
      this.onError?.("start-failed");
      return false;
    }
  }

  getText() {
    return `${this.finalText}${this.interimText}`.trim();
  }

  stop() {
    if (!this.recognition || !this.running) return Promise.resolve(this.getText());

    return new Promise((resolve) => {
      const recognition = this.recognition;
      const finish = () => resolve(this.getText());
      const timeout = window.setTimeout(finish, 600);
      recognition.addEventListener("end", () => {
        window.clearTimeout(timeout);
        finish();
      }, { once: true });
      try { recognition.stop(); } catch (_) { finish(); }
    });
  }

  abort() {
    if (this.recognition && this.running) {
      try { this.recognition.abort(); } catch (_) { /* already stopped */ }
    }
    this.running = false;
    this.recognition = null;
  }
}
