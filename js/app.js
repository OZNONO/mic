import { AudioAnalyzer } from "./audioAnalyzer.js";
import { KoreanSpeechRecognition } from "./speechRecognition.js";
import { CATEGORY_LABELS, selectQuestions } from "./questions.js";
import { clearSessions, loadSessions, saveSession } from "./storage.js";

// 쉽게 조정할 수 있는 한국어 필러 표현 목록입니다.
export const FILLER_WORDS = Object.freeze(["어", "음", "그", "저", "약간", "뭔가", "그러니까"]);

const TYPE_LABELS = Object.freeze({ mixed: "종합", job: "직무", personality: "인성" });
const $ = (selector) => document.querySelector(selector);
const elements = {
  screens: [$("#start-screen"), $("#interview-screen"), $("#results-screen")],
  setupForm: $("#setup-form"),
  startButton: $("#setup-form button[type='submit']"),
  historyList: $("#history-list"),
  clearHistoryButton: $("#clear-history-button"),
  questionProgress: $("#question-progress"),
  progressBar: $("#progress-bar"),
  questionCategory: $("#question-category"),
  questionState: $("#question-state"),
  questionText: $("#question-text"),
  supportMessage: $("#support-message"),
  startAnswerButton: $("#start-answer-button"),
  stopAnswerButton: $("#stop-answer-button"),
  nextQuestionButton: $("#next-question-button"),
  quitButton: $("#quit-button"),
  recordingDot: $("#recording-dot"),
  recordingLabel: $("#recording-label"),
  timer: $("#timer"),
  volumeBar: $("#volume-bar"),
  volumeTrack: $(".volume-track"),
  volumeValue: $("#volume-value"),
  voiceState: $("#voice-state"),
  responseDelayLive: $("#response-delay-live"),
  silenceCountLive: $("#silence-count-live"),
  transcriptText: $("#transcript-text"),
  speechSupportBadge: $("#speech-support-badge"),
  resultsSummaryCopy: $("#results-summary-copy"),
  summaryGrid: $("#summary-grid"),
  insightList: $("#insight-list"),
  answerResults: $("#answer-results"),
  newInterviewButton: $("#new-interview-button")
};

let session = null;
let currentIndex = 0;
let questionShownAt = 0;
let answerStartedAt = 0;
let clockTimer = null;
let waitingTimer = null;
let mediaStream = null;
let mediaRecorder = null;
let isAnswering = false;
let microphoneIssue = "";

const speech = new KoreanSpeechRecognition({
  onText: (text) => showTranscript(text),
  onError: () => {
    elements.supportMessage.textContent = "음성 텍스트 변환이 중단되었습니다. 음량과 침묵 측정은 계속됩니다.";
  }
});

const analyzer = new AudioAnalyzer({
  onUpdate: ({ volumePercent, isVoice, silenceCount }) => {
    elements.volumeBar.style.width = `${volumePercent}%`;
    elements.volumeValue.textContent = `${volumePercent}%`;
    elements.volumeTrack.setAttribute("aria-valuenow", String(volumePercent));
    elements.voiceState.textContent = isVoice ? "음성이 감지되고 있습니다." : "침묵 또는 작은 음량으로 감지됩니다.";
    elements.silenceCountLive.textContent = `${silenceCount}회`;
  }
});

function showScreen(target) {
  elements.screens.forEach((screen) => { screen.hidden = screen !== target; });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function formatTime(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatSeconds(milliseconds, digits = 1) {
  if (!Number.isFinite(milliseconds)) return "측정 안 됨";
  return `${(milliseconds / 1000).toFixed(digits)}초`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  }[character]));
}

function countFillers(text) {
  if (!text) return 0;
  const tokens = text.trim().split(/[\s,.!?~…]+/).filter(Boolean);
  return tokens.reduce((total, token) => total + (FILLER_WORDS.includes(token) ? 1 : 0), 0);
}

function transcriptLength(text) {
  return text.replace(/\s/g, "").length;
}

async function requestMicrophone() {
  microphoneIssue = "";
  if (!navigator.mediaDevices?.getUserMedia) {
    microphoneIssue = "이 브라우저에서는 마이크 분석 API가 지원되지 않습니다. 시간 측정과 질문 연습은 계속할 수 있습니다.";
    return;
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
  } catch (error) {
    console.warn("마이크 권한을 사용할 수 없습니다.", error);
    microphoneIssue = "마이크 권한이 없어 음량과 침묵은 측정되지 않습니다. 브라우저 설정에서 권한을 허용한 뒤 새 면접을 시작할 수 있습니다.";
  }
}

function releaseMicrophone() {
  mediaStream?.getTracks().forEach((track) => track.stop());
  mediaStream = null;
}

async function beginSession(event) {
  event.preventDefault();
  elements.startButton.disabled = true;
  elements.startButton.firstChild.textContent = "마이크 연결 중 ";
  releaseMicrophone();
  await requestMicrophone();

  const formData = new FormData(elements.setupForm);
  const type = formData.get("interviewType") || "mixed";
  const requestedCount = Number(formData.get("questionCount")) || 5;
  session = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    requestedCount,
    createdAt: new Date().toISOString(),
    questions: selectQuestions(type, requestedCount),
    answers: []
  };
  currentIndex = 0;
  elements.startButton.disabled = false;
  elements.startButton.firstChild.textContent = "면접 시작 ";
  showScreen(elements.screens[1]);
  renderQuestion();
}

function renderQuestion() {
  clearTimers();
  isAnswering = false;
  const question = session.questions[currentIndex];
  const total = session.questions.length;

  elements.questionProgress.textContent = `질문 ${currentIndex + 1} / ${total}`;
  elements.progressBar.style.width = `${((currentIndex + 1) / total) * 100}%`;
  elements.questionCategory.textContent = CATEGORY_LABELS[question.category];
  elements.questionText.textContent = question.text;
  elements.questionState.textContent = "답변 준비";
  elements.questionState.className = "status-badge ready";
  elements.startAnswerButton.hidden = false;
  elements.startAnswerButton.disabled = false;
  elements.stopAnswerButton.hidden = false;
  elements.stopAnswerButton.disabled = true;
  elements.nextQuestionButton.hidden = true;
  elements.nextQuestionButton.innerHTML = currentIndex === total - 1 ? "결과 보기 <span aria-hidden=\"true\">→</span>" : "다음 질문 <span aria-hidden=\"true\">→</span>";
  elements.recordingDot.classList.remove("active");
  elements.recordingLabel.textContent = "대기 중";
  elements.timer.textContent = "00:00";
  resetMeter();
  elements.supportMessage.textContent = microphoneIssue;

  if (speech.supported) {
    elements.speechSupportBadge.textContent = "지원됨";
    elements.speechSupportBadge.className = "support-badge";
    elements.transcriptText.textContent = "답변을 시작하면 인식 결과가 표시됩니다.";
  } else {
    elements.speechSupportBadge.textContent = "미지원";
    elements.speechSupportBadge.className = "support-badge unsupported";
    elements.transcriptText.textContent = "이 브라우저에서는 음성 텍스트 변환이 지원되지 않습니다.";
  }
  elements.transcriptText.classList.add("placeholder");

  questionShownAt = performance.now();
  updateWaitingTime();
  waitingTimer = window.setInterval(updateWaitingTime, 100);
}

function updateWaitingTime() {
  const delay = performance.now() - questionShownAt;
  elements.responseDelayLive.textContent = formatSeconds(delay);
}

function resetMeter() {
  elements.volumeBar.style.width = "0%";
  elements.volumeValue.textContent = "0%";
  elements.volumeTrack.setAttribute("aria-valuenow", "0");
  elements.voiceState.textContent = mediaStream
    ? "답변을 시작하면 음량이 표시됩니다."
    : "마이크 분석을 사용할 수 없습니다.";
  elements.silenceCountLive.textContent = "0회";
}

function showTranscript(text) {
  if (!text) return;
  elements.transcriptText.textContent = text;
  elements.transcriptText.classList.remove("placeholder");
}

function startMediaRecording() {
  if (!mediaStream || !window.MediaRecorder) return;
  try {
    mediaRecorder = new MediaRecorder(mediaStream);
    mediaRecorder.ondataavailable = () => { /* 녹음 데이터는 의도적으로 보관하지 않습니다. */ };
    mediaRecorder.start();
  } catch (error) {
    console.warn("MediaRecorder를 시작하지 못했습니다.", error);
    mediaRecorder = null;
  }
}

async function startAnswer() {
  if (isAnswering) return;
  isAnswering = true;
  window.clearInterval(waitingTimer);
  waitingTimer = null;
  const responseDelayMs = performance.now() - questionShownAt;
  answerStartedAt = performance.now();
  session.pendingResponseDelayMs = responseDelayMs;

  elements.startAnswerButton.disabled = true;
  elements.stopAnswerButton.disabled = true;
  elements.questionState.textContent = "답변 중";
  elements.questionState.className = "status-badge recording";
  elements.recordingDot.classList.add("active");
  elements.recordingLabel.textContent = "녹음 중";
  elements.supportMessage.textContent = microphoneIssue;

  const analysisStarted = await analyzer.start(mediaStream);
  session.pendingAnalysisAvailable = analysisStarted;
  if (!isAnswering) {
    analyzer.stop();
    return;
  }
  elements.stopAnswerButton.disabled = false;
  if (!analysisStarted && mediaStream) {
    elements.supportMessage.textContent = "오디오 분석을 시작하지 못했습니다. 답변 시간과 텍스트 변환은 계속 기록합니다.";
  }
  startMediaRecording();
  speech.start();
  updateAnswerClock();
  clockTimer = window.setInterval(updateAnswerClock, 100);
}

function updateAnswerClock() {
  elements.timer.textContent = formatTime(performance.now() - answerStartedAt);
}

async function stopAnswer() {
  if (!isAnswering) return;
  isAnswering = false;
  clearTimers();
  const durationMs = performance.now() - answerStartedAt;
  const audioMetrics = analyzer.stop();

  if (mediaRecorder?.state === "recording") {
    try { mediaRecorder.stop(); } catch (_) { /* already stopped */ }
  }
  mediaRecorder = null;
  const transcript = await speech.stop();
  const hasAudioMetrics = session.pendingAnalysisAvailable;
  const characters = transcriptLength(transcript);
  const voiceMinutes = audioMetrics.voiceDurationMs / 60000;
  const speakingRate = characters > 0 && voiceMinutes > 0 ? Math.round(characters / voiceMinutes) : null;

  session.answers.push({
    question: session.questions[currentIndex],
    responseDelayMs: Math.round(session.pendingResponseDelayMs),
    durationMs: Math.round(durationMs),
    voiceDurationMs: hasAudioMetrics ? audioMetrics.voiceDurationMs : null,
    silenceDurationMs: hasAudioMetrics ? audioMetrics.silenceDurationMs : null,
    silenceCount: hasAudioMetrics ? audioMetrics.silenceCount : null,
    averageVolume: hasAudioMetrics ? audioMetrics.averageVolume : null,
    volumeVariation: hasAudioMetrics ? audioMetrics.volumeVariation : null,
    transcript,
    characters,
    speakingRate,
    fillerCount: countFillers(transcript)
  });

  delete session.pendingResponseDelayMs;
  delete session.pendingAnalysisAvailable;
  elements.timer.textContent = formatTime(durationMs);
  elements.startAnswerButton.hidden = true;
  elements.stopAnswerButton.hidden = true;
  elements.nextQuestionButton.hidden = false;
  elements.questionState.textContent = "답변 완료";
  elements.questionState.className = "status-badge done";
  elements.recordingDot.classList.remove("active");
  elements.recordingLabel.textContent = "기록 완료";
  elements.voiceState.textContent = "답변 측정이 완료되었습니다.";
  if (transcript) showTranscript(transcript);
}

function clearTimers() {
  window.clearInterval(clockTimer);
  window.clearInterval(waitingTimer);
  clockTimer = null;
  waitingTimer = null;
}

function nextQuestion() {
  if (currentIndex >= session.questions.length - 1) {
    finishSession();
    return;
  }
  currentIndex += 1;
  renderQuestion();
}

async function quitSession() {
  if (!window.confirm("현재까지 완료한 답변으로 면접을 끝낼까요?")) return;
  if (isAnswering) await stopAnswer();
  if (session.answers.length === 0) {
    resetToStart();
    return;
  }
  finishSession();
}

function average(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function summarize(currentSession) {
  const answers = currentSession.answers;
  return {
    averageDurationMs: average(answers.map((answer) => answer.durationMs)),
    averageResponseDelayMs: average(answers.map((answer) => answer.responseDelayMs)),
    averageVoiceDurationMs: average(answers.map((answer) => answer.voiceDurationMs)),
    averageSilenceDurationMs: average(answers.map((answer) => answer.silenceDurationMs)),
    totalSilenceCount: answers.reduce((sum, answer) => sum + (answer.silenceCount || 0), 0),
    averageSpeakingRate: average(answers.map((answer) => answer.speakingRate)),
    totalFillerCount: answers.reduce((sum, answer) => sum + answer.fillerCount, 0)
  };
}

function finishSession() {
  clearTimers();
  analyzer.stop();
  speech.abort();
  releaseMicrophone();
  session.completedAt = new Date().toISOString();
  session.summary = summarize(session);
  saveSession(session);
  renderResults();
  renderHistory();
  showScreen(elements.screens[2]);
}

function renderResults() {
  const summary = session.summary;
  elements.resultsSummaryCopy.textContent = `${TYPE_LABELS[session.type]} 면접 ${session.answers.length}문항의 브라우저 측정 결과입니다.`;
  const metrics = [
    ["평균 답변시간", formatSeconds(summary.averageDurationMs), "질문별 전체 답변 구간", true],
    ["평균 응답 시작시간", formatSeconds(summary.averageResponseDelayMs), "질문 표시 후 시작까지"],
    ["평균 실제 발화시간", formatSeconds(summary.averageVoiceDurationMs), "마이크 음성 감지 기준"],
    ["평균 침묵시간", formatSeconds(summary.averageSilenceDurationMs), "작은 음량 구간 포함"],
    ["총 침묵 횟수", `${summary.totalSilenceCount}회`, "1초 이상 지속 기준"],
    ["평균 발화량", Number.isFinite(summary.averageSpeakingRate) ? `${Math.round(summary.averageSpeakingRate)}자/분` : "측정 안 됨", "인식 텍스트·발화시간 기준"],
    ["총 필러 표현", `${summary.totalFillerCount}회`, FILLER_WORDS.join(" · ")]
  ];

  elements.summaryGrid.innerHTML = metrics.map(([label, value, note, primary]) => `
    <article class="metric-card${primary ? " primary-metric" : ""}">
      <span class="metric-label">${escapeHtml(label)}</span>
      <strong class="metric-value">${escapeHtml(value)}</strong>
      <span class="metric-note">${escapeHtml(note)}</span>
    </article>
  `).join("");

  renderInsights(summary);
  elements.answerResults.innerHTML = session.answers.map((answer, index) => `
    <article class="answer-result">
      <div class="answer-result-header">
        <span class="answer-number">${String(index + 1).padStart(2, "0")}</span>
        <h3>${escapeHtml(answer.question.text)}</h3>
      </div>
      <div class="answer-metrics">
        <div><span>답변시간</span><strong>${formatSeconds(answer.durationMs)}</strong></div>
        <div><span>응답 시작</span><strong>${formatSeconds(answer.responseDelayMs)}</strong></div>
        <div><span>침묵</span><strong>${Number.isFinite(answer.silenceCount) ? `${formatSeconds(answer.silenceDurationMs)} · ${answer.silenceCount}회` : "측정 안 됨"}</strong></div>
        <div><span>필러</span><strong>${answer.fillerCount}회</strong></div>
        <div><span>발화량</span><strong>${Number.isFinite(answer.speakingRate) ? `${answer.speakingRate}자/분` : "측정 안 됨"}</strong></div>
      </div>
      <div class="answer-transcript">
        <span>인식된 답변 · ${answer.characters}자</span>
        <p class="${answer.transcript ? "" : "empty"}">${escapeHtml(answer.transcript || "인식된 답변 텍스트가 없습니다.")}</p>
      </div>
    </article>
  `).join("");
}

function renderInsights(summary) {
  const insights = [];
  const answerCount = Math.max(session.answers.length, 1);
  if (summary.averageDurationMs > 150000) {
    insights.push(["답변 길이 점검", "평균 답변이 2분 30초를 넘습니다. 첫 문장에 결론을 두고 핵심 사례만 남겨보세요.", true]);
  } else if (summary.averageDurationMs < 30000) {
    insights.push(["근거를 한 단계 더", "평균 답변이 30초보다 짧습니다. 상황·행동·결과 중 빠진 요소를 보완해 보세요.", true]);
  } else {
    insights.push(["안정적인 답변 길이", "평균 답변 길이가 연습하기 좋은 범위에 있습니다. 질문별 편차도 함께 살펴보세요.", false]);
  }

  const silenceRatio = Number.isFinite(summary.averageSilenceDurationMs) && summary.averageDurationMs
    ? summary.averageSilenceDurationMs / summary.averageDurationMs
    : null;
  if (silenceRatio !== null && silenceRatio > 0.35) {
    insights.push(["긴 침묵 줄이기", "전체 답변 중 침묵 비중이 높은 편입니다. 시작 전 핵심 키워드 2~3개를 먼저 떠올려 보세요.", true]);
  } else if (silenceRatio !== null) {
    insights.push(["침묵 활용", "긴 침묵이 과도하지 않습니다. 문장 사이의 짧은 호흡은 자연스러운 전달에 도움이 됩니다.", false]);
  }

  if (summary.totalFillerCount / answerCount > 4) {
    insights.push(["필러 대신 짧은 호흡", "답변마다 필러가 자주 인식되었습니다. ‘어’, ‘음’ 대신 잠깐 멈춘 뒤 다음 문장을 시작해 보세요.", true]);
  } else if (session.answers.some((answer) => answer.transcript)) {
    insights.push(["필러 사용", "인식된 텍스트에서 필러 표현이 두드러지지 않았습니다. 실제 녹음 환경에 따라 인식 결과는 달라질 수 있습니다.", false]);
  } else {
    insights.push(["텍스트 지표 제한", "음성 텍스트가 없어 필러와 발화량을 충분히 분석하지 못했습니다. 지원되는 Chrome 환경에서 다시 확인해 보세요.", true]);
  }

  elements.insightList.innerHTML = insights.map(([title, copy, warning]) => `
    <article class="insight-item${warning ? " warning" : ""}">
      <span class="insight-mark">${warning ? "!" : "✓"}</span>
      <div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(copy)}</p></div>
    </article>
  `).join("");
}

function renderHistory() {
  const sessions = loadSessions();
  elements.clearHistoryButton.hidden = sessions.length === 0;
  if (!sessions.length) {
    elements.historyList.innerHTML = '<div class="empty-history">아직 저장된 연습 기록이 없습니다.<br>첫 면접을 시작해 보세요.</div>';
    return;
  }

  elements.historyList.innerHTML = sessions.slice(0, 6).map((item) => {
    const date = new Date(item.completedAt || item.createdAt);
    const hasValidDate = !Number.isNaN(date.getTime());
    const summary = item.summary || {};
    return `
      <article class="history-card">
        <div class="history-card-top"><span>${escapeHtml(TYPE_LABELS[item.type] || "면접")}</span><time${hasValidDate ? ` datetime="${escapeHtml(date.toISOString())}"` : ""}>${hasValidDate ? escapeHtml(date.toLocaleDateString("ko-KR")) : "날짜 없음"}</time></div>
        <h3>${item.answers?.length || 0}문항 연습</h3>
        <div class="history-metrics">
          <div><span>평균 답변</span><strong>${formatSeconds(summary.averageDurationMs, 0)}</strong></div>
          <div><span>침묵</span><strong>${summary.totalSilenceCount || 0}회</strong></div>
          <div><span>필러</span><strong>${summary.totalFillerCount || 0}회</strong></div>
        </div>
      </article>`;
  }).join("");
}

function resetToStart() {
  clearTimers();
  analyzer.stop();
  speech.abort();
  if (mediaRecorder?.state === "recording") {
    try { mediaRecorder.stop(); } catch (_) { /* already stopped */ }
  }
  mediaRecorder = null;
  releaseMicrophone();
  session = null;
  renderHistory();
  showScreen(elements.screens[0]);
}

elements.setupForm.addEventListener("submit", beginSession);
elements.startAnswerButton.addEventListener("click", startAnswer);
elements.stopAnswerButton.addEventListener("click", stopAnswer);
elements.nextQuestionButton.addEventListener("click", nextQuestion);
elements.quitButton.addEventListener("click", quitSession);
elements.newInterviewButton.addEventListener("click", resetToStart);
elements.clearHistoryButton.addEventListener("click", () => {
  if (window.confirm("최근 면접 기록을 모두 삭제할까요?")) {
    clearSessions();
    renderHistory();
  }
});
window.addEventListener("beforeunload", releaseMicrophone);

renderHistory();
