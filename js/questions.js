const JOB_QUESTIONS = [
  "지원한 직무를 선택한 이유와 이 직무에서 이루고 싶은 목표를 말씀해 주세요.",
  "지원 직무에 가장 필요한 역량은 무엇이며, 그 역량을 발휘한 경험이 있나요?",
  "복잡한 문제를 구조화하고 해결했던 경험을 구체적으로 설명해 주세요.",
  "목표를 달성하기 위해 데이터를 활용해 의사결정했던 경험을 말씀해 주세요.",
  "업무 우선순위가 갑자기 바뀌었을 때 어떻게 대응했는지 말씀해 주세요.",
  "본인이 주도적으로 업무 방식이나 프로세스를 개선한 경험이 있나요?",
  "예상과 다른 결과가 나왔던 프로젝트와 그때 배운 점을 말씀해 주세요.",
  "빠르게 새로운 지식이나 도구를 익혀 성과를 낸 경험을 설명해 주세요.",
  "여러 이해관계자의 요구가 충돌했을 때 어떻게 조율했나요?",
  "제한된 시간과 자원 안에서 성과를 만들어낸 경험을 말씀해 주세요.",
  "본인의 전문성을 유지하고 발전시키기 위해 평소 어떤 노력을 하나요?",
  "지원 직무에서 입사 후 첫 3개월 동안 무엇을 배우고 기여하고 싶나요?",
  "업무 결과의 품질을 확인하기 위해 사용하는 본인만의 기준이나 방법이 있나요?",
  "고객 또는 사용자의 요구를 파악해 결과물에 반영한 경험을 말씀해 주세요.",
  "동시에 여러 업무를 맡았을 때 일정과 품질을 관리한 방법을 설명해 주세요."
];

const PERSONALITY_QUESTIONS = [
  "본인을 세 단어로 표현하고, 그렇게 생각한 이유를 말씀해 주세요.",
  "가장 큰 실패 경험과 그 이후 행동이 어떻게 달라졌는지 말씀해 주세요.",
  "팀원과 의견이 크게 달랐던 상황에서 어떻게 해결했나요?",
  "피드백을 받고 불편했지만 결과적으로 성장에 도움이 된 경험이 있나요?",
  "본인이 팀에 기여하는 가장 큰 강점과 보완 중인 약점은 무엇인가요?",
  "원칙을 지키는 것과 빠른 성과가 충돌했던 경험을 말씀해 주세요.",
  "스트레스가 높은 상황에서 감정과 업무를 어떻게 관리하나요?",
  "다른 사람을 설득하거나 협조를 이끌어낸 경험을 설명해 주세요.",
  "최근 스스로 세운 목표와 그것을 꾸준히 실행한 과정을 말씀해 주세요.",
  "함께 일하기 어려웠던 사람과 협업해야 했던 경험이 있나요?",
  "예상치 못한 변화에 적응했던 경험과 그 과정에서 배운 점은 무엇인가요?",
  "리더 역할과 팔로워 역할 중 더 익숙한 쪽과 그 이유를 말씀해 주세요.",
  "직장을 선택할 때 가장 중요하게 생각하는 기준은 무엇인가요?",
  "윤리적으로 고민되는 상황을 마주했을 때 어떻게 판단하겠습니까?",
  "주변 사람들이 본인을 어떤 동료로 기억하기를 바라나요?"
];

export const CATEGORY_LABELS = Object.freeze({
  job: "직무",
  personality: "인성"
});

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export function selectQuestions(type, count) {
  const job = JOB_QUESTIONS.map((text) => ({ text, category: "job" }));
  const personality = PERSONALITY_QUESTIONS.map((text) => ({ text, category: "personality" }));
  let pool;

  if (type === "job") pool = job;
  else if (type === "personality") pool = personality;
  else pool = [...job, ...personality];

  return shuffle(pool).slice(0, Math.min(count, pool.length));
}
