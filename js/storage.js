const STORAGE_KEY = "interviewVoiceLab.sessions.v1";
const MAX_SESSIONS = 10;

export function loadSessions() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("최근 기록을 불러오지 못했습니다.", error);
    return [];
  }
}

export function saveSession(session) {
  try {
    const sessions = [session, ...loadSessions()].slice(0, MAX_SESSIONS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    return true;
  } catch (error) {
    console.warn("최근 기록을 저장하지 못했습니다.", error);
    return false;
  }
}

export function clearSessions() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch (error) {
    console.warn("최근 기록을 삭제하지 못했습니다.", error);
    return false;
  }
}
