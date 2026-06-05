const API_BASE_URL = 'http://localhost:5000/api';

// 이벤트 리스너 등록 (CSP 준수)
document.addEventListener('DOMContentLoaded', () => {
    // 전송 버튼
    document.getElementById('sendBtn').addEventListener('click', sendMessage);
    
    // 엔터키
    document.getElementById('messageInput').addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            sendMessage();
        }
    });
    
    // 빠른 액션 버튼
    document.querySelectorAll('.quick-action').forEach(button => {
        button.addEventListener('click', () => {
            sendQuickAction(button.dataset.action);
        });
    });

    // 이력서 업로드
    document.getElementById('resumeUploadBtn').addEventListener('click', () => {
        document.getElementById('resumeFile').click();
    });
    document.getElementById('resumeFile').addEventListener('change', handleResumeUpload);
    document.getElementById('resumeClearBtn').addEventListener('click', clearResume);
    document.getElementById('resumeTestBtn').addEventListener('click', loadTestResume);
    loadResumeProfile();
    loadLearnedPatterns();
    loadConversation();
});

// 에이전트 설정
const MAX_STEPS = 15;
let agentRunning = false;
let pending = null; // 민감 작업 확인 대기 상태: { goal, history }
let conversation = []; // 대화 맥락: [{ role: 'user'|'assistant', content }]
let resumeProfile = null; // 이력서 프로필 (지원서 자동작성용)

// ===== 테스트용 하드코딩 이력서 =====
const TEST_RESUME_PROFILE = {
    "name": "강성탁",
    "age": "31",
    "email": "sug0256@naver.com",
    "phone": "010-9998-7436",
    "address": "수목원로 577-15",
    "birthdate": "1993.10.16",
    "military_service": {
        "status": "군필",
        "period": "2013.06 ~ 2015.03",
        "branch": "육군",
        "rank": "병장",
        "discharge": "만기제대",
        "disability": ""
    },
    "education": [
        {
            "school": "중부대학교",
            "major": "컴퓨터공학",
            "minor": "",
            "double_major": "",
            "degree": "학사",
            "status": "졸업",
            "period": "2015.03 ~ 2019.02",
            "start_date": "2015.03",
            "end_date": "2019.02",
            "credits_earned": "3.8",
            "credits_total": "4.5"
        }
    ],
    "experience": [
        {
            "company": "아톰정보기술",
            "role": "대리",
            "department": "백엔드 개발팀",
            "employment_type": "정규직",
            "start_date": "2021.03.01",
            "end_date": "2024.12.31",
            "period": "2021.03 ~ 2024.12",
            "duties": "JAVA, JPA, SQL, AWS, Spring Boot 등의 기술을 활용하여 백엔드 API 설계 및 개발. DB 설계 및 최적화, 시스템 운영 및 유지보수 담당.",
            "reason_for_leaving": "이직",
            "salary": "4000"
        }
    ],
    "certifications": ["정보처리기사", "컴퓨터활용능력1급", "운전면허1종보통"],
    "skills": ["Python", "JavaScript", "React", "Docker", "Java", "Spring Boot", "AWS"],
    "projects": [
        {
            "name": "백엔드 API 개발",
            "description": "JAVA, JPA, SQL, AWS, Spring Boot 등의 기술을 활용하여 백엔드 API 설계 및 개발",
            "tech_stack": ["Java", "Spring Boot", "JPA", "AWS", "SQL"],
            "period": "2021.03 ~ 2024.12"
        }
    ],
    "self_introduction": "지원자의 성장과정, 성격의 장단점, 가치관 등을 바탕으로 자기소개를 기술해 주시기 바랍니다."
};

// ===== 이력서 프로필 관리 =====
function loadResumeProfile() {
    chrome.storage.local.get(['resumeProfile'], (res) => {
        if (res && res.resumeProfile) {
            resumeProfile = res.resumeProfile;
            updateResumeStatus();
        }
    });
}

function loadConversation() {
    chrome.storage.local.get(['conversation'], (res) => {
        if (res && Array.isArray(res.conversation)) {
            conversation = res.conversation;
            // 기존 메시지 UI 복원
            conversation.forEach(turn => {
                addMessage(turn.role, turn.content);
            });
        }
    });
}

function saveConversation() {
    chrome.storage.local.set({ conversation });
}

// ===== 학습 패턴 관리 =====
let learnedPatterns = [];

function loadLearnedPatterns() {
    chrome.storage.local.get(['learnedPatterns'], (res) => {
        learnedPatterns = (res && res.learnedPatterns) || [];
        console.log('[Learn] Loaded patterns:', learnedPatterns.length);
    });
}

function clearLearnedPatterns() {
    learnedPatterns = [];
    chrome.storage.local.remove('learnedPatterns');
}

// 학습된 패턴으로 직접 매핑 시도
function tryLearnedMatch(emptyFields) {
    if (!learnedPatterns.length || !resumeProfile) return { matched: [], remaining: emptyFields };

    const matched = [];
    const remaining = [];

    for (const field of emptyFields) {
        const fLabel = (field.label || '').toLowerCase();
        const fGroup = (field.group || '').toLowerCase();
        const fTag = (field.tag || '').toLowerCase();
        const fType = (field.type || '').toLowerCase();
        const fRole = (field.role || '').toLowerCase();
        const fName = (field.name || '').toLowerCase();

        let found = null;
        for (const p of learnedPatterns) {
            const s = p.signature;
            // 시그니처 매칭 점수 (label + group + tag/role)
            let score = 0;
            if (s.label && fLabel.includes(s.label.toLowerCase())) score += 3;
            if (s.group && fGroup.includes(s.group.toLowerCase())) score += 2;
            if (s.tag && s.tag === fTag) score += 1;
            if (s.type && s.type === fType) score += 1;
            if (s.role && s.role === fRole) score += 1;
            if (s.name && fName.includes(s.name.toLowerCase())) score += 2;

            if (score >= 3) {
                // 이력서에서 값 추출
                const keys = p.inferred_keys || [];
                let value = '';
                for (const key of keys) {
                    value = getNestedValue(resumeProfile, key);
                    if (value && String(value).trim()) break;
                }
                if (value && String(value).trim()) {
                    found = {
                        index: field.index,
                        label: field.label || s.label,
                        value: String(value).trim(),
                        action_type: p.action_type,
                        source: 'learned'
                    };
                    break;
                }
            }
        }

        if (found) {
            matched.push(found);
        } else {
            remaining.push(field);
        }
    }

    return { matched, remaining };
}

// 학습 데이터를 프롬프트용 텍스트로 변환
function buildLearnedPrompt() {
    if (!learnedPatterns.length) return '';
    const lines = ['[이전에 학습한 매핑 패턴 - 참고하세요]'];
    for (const p of learnedPatterns) {
        const s = p.signature;
        const keys = (p.inferred_keys || []).join(', ');
        lines.push(`- 라벨='${s.label}' 그룹='${s.group}' 태그=${s.tag}${s.type ? ' type=' + s.type : ''}${s.role ? ' role=' + s.role : ''} → 이력서 키: ${keys} (액션: ${p.action_type})`);
    }
    lines.push('위 패턴과 유사한 필드를 만나면 동일한 이력서 키와 동일한 액션 방식을 사용하세요.\n');
    return lines.join('\n');
}

// 중첩 객체에서 값 가져오기 (e.g. "military_service.branch")
function getNestedValue(obj, path) {
    if (!obj || !path) return '';
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
        if (current == null) return '';
        if (/^\d+$/.test(part) && Array.isArray(current)) {
            current = current[parseInt(part)];
        } else {
            current = current[part];
        }
    }
    return current || '';
}

function updateResumeStatus() {
    const status = document.getElementById('resumeStatus');
    const clearBtn = document.getElementById('resumeClearBtn');
    if (resumeProfile) {
        const name = resumeProfile.name || '이름 미상';
        status.textContent = `📄 이력서 등록됨: ${name}`;
        clearBtn.style.display = 'inline-block';
    } else {
        status.textContent = '📄 이력서 미등록';
        clearBtn.style.display = 'none';
    }
}

async function handleResumeUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = ''; // 같은 파일 재선택 허용

    const status = document.getElementById('resumeStatus');
    const uploadBtn = document.getElementById('resumeUploadBtn');
    status.textContent = '📄 이력서 분석 중...';
    uploadBtn.disabled = true;

    try {
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch(`${API_BASE_URL}/resume/parse-profile`, {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        if (result.status === 'success' && result.profile) {
            resumeProfile = result.profile;
            chrome.storage.local.set({ resumeProfile });
            updateResumeStatus();
            addMessage('agent', `✅ 이력서를 분석했습니다. 이제 "지원서 작성" 버튼이나 "이력서로 빈칸 채워줘"라고 말씀하시면 폼을 자동으로 채워드립니다.`);
        } else {
            status.textContent = '📄 이력서 분석 실패';
            addMessage('agent', `⚠️ 이력서 분석 실패: ${result.error || '알 수 없는 오류'}`);
        }
    } catch (e) {
        status.textContent = '📄 이력서 분석 실패';
        addMessage('agent', `⚠️ 이력서 업로드 중 오류: ${e.message} (백엔드 서버가 실행 중인지 확인하세요)`);
    } finally {
        uploadBtn.disabled = false;
    }
}

function loadTestResume() {
    resumeProfile = JSON.parse(JSON.stringify(TEST_RESUME_PROFILE));
    chrome.storage.local.set({ resumeProfile });
    updateResumeStatus();
    addMessage('agent', `✅ 테스트 이력서를 로드했습니다: ${resumeProfile.name} (생년월일: ${resumeProfile.birthdate})\\n이제 "지원서 작성" 버튼이나 "이력서로 빈칸 채워줘"라고 말씀하시면 폼을 자동으로 채워드립니다.`);
}

function clearResume() {
    resumeProfile = null;
    chrome.storage.local.remove('resumeProfile');
    updateResumeStatus();
    addMessage('agent', '이력서 정보를 삭제했습니다.');
}

// 긍정 응답 판별
function isAffirmative(msg) {
    const m = msg.trim().toLowerCase();
    return ['계속', '응', '네', '예', '확인', '진행', 'ok', 'yes', 'y', '계속해', '계속해줘', '진행해', '진행해줘'].includes(m);
}

// 민감 작업 감지 (로그인/회원가입/인증/결제/비밀번호)
function detectSensitive(action, element) {
    // 비밀번호 입력은 항상 민감
    if (element && element.type === 'password') return '비밀번호 입력';
    if (action.action !== 'click' && action.action !== 'input' && action.action !== 'submit') return null;
    if (!element) return null;

    const haystack = [element.text, element.name, element.placeholder]
        .filter(Boolean).join(' ').toLowerCase();

    const rules = [
        { kw: ['로그인', 'login', 'log in', 'sign in', 'signin'], label: '로그인' },
        { kw: ['회원가입', '가입하기', 'sign up', 'signup', 'register', '계정 만들기'], label: '회원가입' },
        { kw: ['본인인증', '휴대폰 인증', '공동인증', '공인인증', '인증번호', 'otp', 'verify', 'verification', '인증하기'], label: '본인인증' },
        { kw: ['결제', '카드번호', '카드 정보', 'payment', 'checkout', 'pay now', '주문하기', '결제하기'], label: '결제' },
    ];
    for (const r of rules) {
        if (r.kw.some(k => haystack.includes(k))) return r.label;
    }
    return null;
}

// 메시지 전송 → 에이전트 루프 시작
async function sendMessage() {
    if (agentRunning) {
        addMessage('agent', '이전 작업을 아직 수행 중입니다. 잠시만 기다려주세요.');
        return;
    }

    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    if (!text) return;

    addMessage('user', text);
    input.value = '';
    conversation.push({ role: 'user', content: text });
    saveConversation();

    // 민감 작업 확인 대기 중이면
    if (pending) {
        if (isAffirmative(text)) {
            const { goal, history } = pending;
            pending = null;
            addMessage('agent', '확인했습니다. 이어서 진행합니다.');
            await runAgentLoop(goal, history, true);
        } else {
            pending = null;
            addMessage('agent', '중단했습니다. 새로운 요청을 입력해주세요.');
        }
        return;
    }

    // 목표가 폼 채우기 관련이면 Two-Pass 배치 루프 사용, 아니면 기존 단일액션 루프
    const fillKeywords = ['채워', '입력', '자동작성', '폼', '이력서', '지원서', '빈칸'];
    const isFillGoal = fillKeywords.some(kw => text.includes(kw));
    if (isFillGoal) {
        await runBatchFillLoop(text);
    } else {
        await runAgentLoop(text);
    }
}

// 에이전트 루프: 관찰 → 결정 → 실행 → 반복
// approvedSensitive: 사용자가 직전 민감 작업을 승인한 경우 true (1회성)
async function runAgentLoop(goal, history = [], approvedSensitive = false) {
    agentRunning = true;
    setInputEnabled(false);
    let sensitiveApproved = approvedSensitive;

    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs && tabs[0];
        if (!tab || !tab.id) {
            addMessage('agent', '⚠️ 현재 활성 탭을 찾을 수 없습니다. 브라우저에서 웹페이지를 열고 다시 시도해주세요.');
            return;
        }
        let tabId = tab.id;

        for (let step = 0; step < MAX_STEPS; step++) {
            showTyping(true);

            // 1. 현재 페이지 상태 수집
            let pageState;
            try {
                pageState = await collectPageState(tabId);
            } catch (e) {
                // chrome:// 등 제한된 페이지는 주입 불가 → 빈 상태로 LLM에 전달해 navigate 유도
                let curUrl = '';
                try {
                    const t = await chrome.tabs.get(tabId);
                    curUrl = t.url || '';
                } catch (_) {}
                pageState = {
                    url: curUrl,
                    title: '(읽을 수 없는 페이지 - 이동이 필요합니다)',
                    elements: []
                };
            }

            // 2. 백엔드에 다음 액션 요청
            let action;
            try {
                const response = await fetch(`${API_BASE_URL}/agent/step`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        goal: goal,
                        url: pageState.url,
                        title: pageState.title,
                        elements: pageState.elements,
                        page_text: pageState.pageText || '',
                        history: history,
                        sensitive_approved: sensitiveApproved,
                        conversation: conversation.slice(-8),
                        resume_profile: resumeProfile
                    })
                });
                const result = await response.json();
                showTyping(false);

                if (result.status !== 'success') {
                    addMessage('agent', `에러: ${result.error}`);
                    break;
                }
                action = result.action;
            } catch (error) {
                showTyping(false);
                addMessage('agent', `백엔드 연결 실패: ${error.message} (서버가 실행 중인지 확인하세요)`);
                break;
            }

            // 3. 생각 표시
            if (action.thought) {
                addMessage('agent', action.thought);
            }

            // 4. 종료 조건
            if (action.action === 'done') {
                const msg = action.message || '완료했습니다!';
                addMessage('agent', `✅ ${msg}`);
                conversation.push({ role: 'assistant', content: msg });
                saveConversation();
                break;
            }
            if (action.action === 'answer') {
                const msg = action.message || '답변을 생성하지 못했습니다.';
                addMessage('agent', msg);
                conversation.push({ role: 'assistant', content: msg });
                saveConversation();
                break;
            }
            if (action.action === 'ask') {
                const msg = action.message || '추가 정보가 필요합니다.';
                addMessage('agent', `❓ ${msg}`);
                conversation.push({ role: 'assistant', content: msg });
                saveConversation();
                // 민감 작업 확인 요청일 수 있으므로 재개 가능하도록 상태 저장
                pending = { goal, history: [...history] };
                break;
            }

            // 4-1. 구글 검색 (현재 탭에서 진행)
            if (action.action === 'search') {
                const query = action.query || goal;
                const searchUrl = 'https://www.google.com/search?q=' + encodeURIComponent(query);
                await chrome.tabs.update(tabId, { url: searchUrl });
                addMessage('agent', `🔍 구글에서 "${query}" 검색 중...`);
                history.push({ action: 'search', detail: `구글 검색: ${query}` });
                await waitForTabLoad(tabId);
                continue;
            }

            // 4-1b. 빈 값 input/select 방지 (무한루프 차단)
            if ((action.action === 'input' || action.action === 'select') && !(action.text && action.text.trim())) {
                history.push({ action: action.action, detail: `[${action.index}] 채울 값이 없어 건너뜀` });
                continue;
            }

            // 4-1c. 이미 값이 있는 필드 재입력 방지 (덮어쓰기 차단)
            if (action.action === 'input') {
                const targetEl = pageState.elements.find(e => e.index === action.index);
                if (targetEl && targetEl.value && targetEl.value.trim()) {
                    history.push({ action: 'input', detail: `[${action.index}] 이미 값이 있어 건너뜀 (현재값: ${targetEl.value})` });
                    continue;
                }
            }

            // 4-2. 민감 작업 하드 가드 (LLM이 놓쳐도 안전하게 정지)
            const targetElement = pageState.elements.find(e => e.index === action.index);
            const sensitiveLabel = detectSensitive(action, targetElement);
            if (sensitiveLabel && !sensitiveApproved) {
                addMessage('agent', `🔒 <b>${sensitiveLabel}</b> 단계입니다. 보안을 위해 자동으로 진행하지 않습니다.<br>직접 진행하시거나, 제가 이어서 하길 원하시면 <b>"계속"</b>이라고 입력해주세요.`);
                pending = { goal, history: [...history] };
                break;
            }
            // 승인된 민감 작업은 1회만 통과
            if (sensitiveLabel && sensitiveApproved) {
                sensitiveApproved = false;
            }

            // 5. 액션 실행
            const execResult = await executeAgentAction(tabId, action, pageState.elements);
            history.push({
                action: action.action,
                detail: execResult.detail
            });

            if (!execResult.success) {
                addMessage('agent', `⚠️ ${execResult.detail}`);
            }

            // 6. navigate/클릭/제출 후 대기
            if (action.action === 'navigate' || action.action === 'submit') {
                await waitForTabLoad(tabId);
            } else if (action.action === 'click' || action.action === 'input' || action.action === 'select') {
                // SPA 위젯(드롭다운/달력 등) 렌더링 안정화를 위한 짧은 대기
                await sleep(600);
            }

            if (step === MAX_STEPS - 1) {
                addMessage('agent', '⏹️ 최대 스텝에 도달했습니다. 작업을 중단합니다.');
            }
        }
    } finally {
        showTyping(false);
        agentRunning = false;
        setInputEnabled(true);
    }
}

// 빈 입력 필드 판별 (자기소개서 textarea 제외)
function isFillableEmptyField(el) {
    const tag = el.tag;
    const type = (el.type || '').toLowerCase();
    const role = (el.role || '').toLowerCase();
    const hasValue = el.value && el.value.trim();

    // textarea는 자기소개서로 간주, 제외
    if (tag === 'textarea') return false;

    // input, select, combobox만
    const isField = (tag === 'input' || tag === 'select' || role === 'combobox');
    if (!isField) return false;

    // 이미 값이 있으면 제외
    if (hasValue) return false;

    // 버튼/숨김/파일 타입 제외
    if (tag === 'input' && (type === 'submit' || type === 'reset' || type === 'button' || type === 'file' || type === 'hidden')) return false;

    return true;
}

// Two-Pass 배치 폼 채우기 루프
// Pass 1: 10개씩 묶어서 LLM에게 필드↔이력서 매핑 요청
// Pass 2: 매핑 결과를 순차적으로 실행 (LLM 호출 없음)
async function runBatchFillLoop(goal, history = []) {
    agentRunning = true;
    setInputEnabled(false);

    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs && tabs[0];
        if (!tab || !tab.id) {
            addMessage('agent', '⚠️ 현재 활성 탭을 찾을 수 없습니다.');
            return;
        }
        const tabId = tab.id;

        // 1. 페이지 상태 수집
        let pageState;
        try {
            pageState = await collectPageState(tabId);
        } catch (e) {
            addMessage('agent', '⚠️ 페이지 상태를 수집할 수 없습니다.');
            return;
        }

        // 2. 빈 input/select 필터링 (textarea 제외)
        const emptyFields = pageState.elements.filter(isFillableEmptyField);
        if (emptyFields.length === 0) {
            addMessage('agent', '✅ 채울 수 있는 빈 입력 필드가 없습니다.');
            return;
        }

        addMessage('agent', `🔍 빈 입력 필드 ${emptyFields.length}개 발견. 매핑 시작...`);

        // 3-1. 학습된 패턴으로 먼저 직접 매핑 (LLM 호출 없이)
        let fieldsForLLM = emptyFields;
        let allMappings = [];
        let allUnmatched = [];

        if (learnedPatterns.length > 0) {
            const learnedResult = tryLearnedMatch(emptyFields);
            if (learnedResult.matched.length > 0) {
                allMappings.push(...learnedResult.matched);
                fieldsForLLM = learnedResult.remaining;
                addMessage('agent', `🧠 학습 패턴으로 ${learnedResult.matched.length}개 직접 매칭`);
            }
        }

        // 3-2. Pass 1: 남은 필드를 10개씩 배치로 LLM에게 매핑 요청
        const BATCH_SIZE = 10;

        for (let i = 0; i < fieldsForLLM.length; i += BATCH_SIZE) {
            const batch = fieldsForLLM.slice(i, i + BATCH_SIZE);
            showTyping(true);

            let result;
            try {
                const payload = {
                    elements: batch,
                    resume_profile: resumeProfile,
                    learned_prompt: buildLearnedPrompt()
                };
                console.log('[BatchFill] Pass 1 요청 (배치 ' + (Math.floor(i / BATCH_SIZE) + 1) + '):', JSON.parse(JSON.stringify(payload)));

                const resp = await fetch(`${API_BASE_URL}/agent/map-fields`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                result = await resp.json();
                console.log('[BatchFill] Pass 1 응답:', JSON.parse(JSON.stringify(result)));
            } catch (err) {
                addMessage('agent', `⚠️ 매핑 요청 실패: ${err.message}`);
                continue;
            }
            showTyping(false);

            if (result.status === 'success') {
                const mappings = result.mappings || [];
                allMappings.push(...mappings);
                allUnmatched.push(...(result.unmatched || []));
                addMessage('agent', `📋 배치 ${Math.floor(i / BATCH_SIZE) + 1}: ${mappings.length}개 매칭`);
            }
        }

        if (allMappings.length === 0) {
            addMessage('agent', '⚠️ 매칭된 필드가 없습니다. 이력서 데이터와 일치하는 필드를 찾지 못했습니다.');
            return;
        }

        addMessage('agent', `✍️ 총 ${allMappings.length}개 필드 입력 시작...`);

        // 4. Pass 2: 실행 (LLM 호출 없이 순차 실행)
        let successCount = 0;
        let failCount = 0;

        for (const mapping of allMappings) {
            const el = emptyFields.find(e => e.index === mapping.index) ||
                       pageState.elements.find(e => e.index === mapping.index);

            // tag에 따라 action 결정
            let actionType = 'input';
            if (el && (el.tag === 'select' || el.role === 'combobox')) {
                actionType = 'select';
            }

            const action = {
                action: actionType,
                index: mapping.index,
                text: mapping.value
            };

            const execResult = await executeAgentAction(tabId, action, pageState.elements);
            history.push({ action: action.action, detail: execResult.detail });

            if (execResult.success) {
                successCount++;
            } else {
                failCount++;
                addMessage('agent', `⚠️ ${execResult.detail}`);
            }

            await sleep(600);
        }

        // 5. 결과 보고
        let report = `✅ 입력 완료: ${successCount}개 성공`;
        if (failCount > 0) report += ` / ${failCount}개 실패`;
        if (allUnmatched.length > 0) report += `\n⚠️ 매칭 실패: ${allUnmatched.join(', ')}`;
        addMessage('agent', report);

    } finally {
        showTyping(false);
        agentRunning = false;
        setInputEnabled(true);
    }
}

// 탭 로딩 완료까지 대기 (최대 10초)
async function waitForTabLoad(tabId, timeoutMs = 10000) {
    const start = Date.now();
    // 먼저 약간 대기 (navigation 시작 시간 확보)
    await sleep(300);
    while (Date.now() - start < timeoutMs) {
        try {
            const t = await chrome.tabs.get(tabId);
            if (t.status === 'complete') {
                await sleep(400); // 렌더링 안정화
                return;
            }
        } catch (_) {}
        await sleep(200);
    }
}

// 페이지 상태 수집 (content 컴텍스트에서 실행)
// 요소가 비어 있으면 로딩 중일 수 있으므로 몇 번 재시도
async function collectPageState(tabId) {
    let last = null;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const [{ result }] = await chrome.scripting.executeScript({
                target: { tabId },
                func: pageStateCollector
            });
            last = result;
            // 사용자 행동 학습 옵저버도 함께 주입 (중복 주입 방지는 함수 내부에서 처리)
            try {
                await chrome.scripting.executeScript({
                    target: { tabId },
                    func: userActionObserver
                });
            } catch (_) {}
            if (result && result.elements && result.elements.length > 0) {
                return result;
            }
        } catch (e) {
            // chrome:// 등 주입 불가 페이지
            break;
        }
        await sleep(500); // 로딩 대기 후 재시도
    }
    // 실패해도 빈 객체 반환 (null 방지)
    let curUrl = '';
    let curTitle = '';
    try {
        const t = await chrome.tabs.get(tabId);
        curUrl = t.url || '';
        curTitle = t.title || '';
    } catch (_) {}
    return last || {
        url: curUrl,
        title: curTitle || '(페이지 정보를 읽을 수 없습니다)',
        elements: [],
        pageText: ''
    };
}

// 에이전트 액션 실행
async function executeAgentAction(tabId, action, elements) {
    // navigate는 popup에서 직접 처리 (페이지 컴텍스트 손실 방지)
    if (action.action === 'navigate') {
        let url = action.url || '';
        if (url && !/^https?:\/\//i.test(url)) {
            url = 'https://' + url;
        }
        await chrome.tabs.update(tabId, { url });
        return { success: true, detail: `→ ${url} 이동` };
    }

    if (action.action === 'wait') {
        const secs = action.seconds || 1;
        await sleep(secs * 1000);
        return { success: true, detail: `${secs}초 대기` };
    }

    // click / input / submit / scroll 은 페이지 컴텍스트에서 실행
    const targetEl = elements.find(e => e.index === action.index);
    const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: pageActionExecutor,
        args: [action]
    });

    // 사용자에게 보여줄 설명
    let label = '';
    if (targetEl) {
        label = (targetEl.label || targetEl.placeholder || targetEl.text || targetEl.name || targetEl.tag);
    }
    let detail = '';
    if (action.action === 'click') detail = `[${action.index}] ${label} 클릭`;
    else if (action.action === 'input') detail = `[${action.index}] ${label}에 "${action.text}" 입력`;
    else if (action.action === 'select') detail = `[${action.index}] ${label}에서 "${action.text}" 선택`;
    else if (action.action === 'submit') detail = `[${action.index}] Enter 전송`;
    else if (action.action === 'scroll') detail = `${action.direction || 'down'} 스크롤`;

    addMessage('agent', `• ${detail}`);
    return { success: result.success, detail: result.success ? detail : (result.error || '요소를 찾지 못했습니다') };
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function setInputEnabled(enabled) {
    document.getElementById('sendBtn').disabled = !enabled;
    document.getElementById('messageInput').disabled = !enabled;
}

// 빠른 액션 전송
function sendQuickAction(action) {
    document.getElementById('messageInput').value = action;
    sendMessage();
}

// 메시지 추가
function addMessage(type, content) {
    const container = document.getElementById('chatContainer');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = content.replace(/\n/g, '<br>');
    
    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = getCurrentTime();
    
    messageDiv.appendChild(contentDiv);
    messageDiv.appendChild(timeDiv);
    container.appendChild(messageDiv);
    
    // 스크롤 하단으로
    container.scrollTop = container.scrollHeight;
}

// 타이핑 인디케이터
function showTyping(show) {
    const indicator = document.getElementById('typingIndicator');
    if (show) {
        indicator.classList.add('active');
    } else {
        indicator.classList.remove('active');
    }
}

// 현재 시간
function getCurrentTime() {
    const now = new Date();
    return now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

// ===== 페이지 컨텍스트에서 실행되는 함수들 =====
// 주의: 이 함수들은 chrome.scripting.executeScript로 주입되어
// 페이지 컨텍스트에서 실행됩니다. 외부 변수를 참조할 수 없습니다.

// 상호작용 가능한 요소 수집 + 인덱스 태깅
function pageStateCollector() {
    const ATTR = 'data-agent-idx';
    // 이전 태그 제거
    document.querySelectorAll('[' + ATTR + ']').forEach(el => el.removeAttribute(ATTR));

    const selector = 'a, button, input, textarea, select, [role="button"], [role="link"], [onclick], [role="option"], [role="menuitem"], [role="menuitemcheckbox"], [role="gridcell"], [role="combobox"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="spinbutton"], [contenteditable="true"]';
    const candidates = Array.from(document.querySelectorAll(selector));

    function isVisible(el) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        return true;
    }

    // class/aria 기반 체크 상태 추론 (동적 위젯 대응)
    function isCheckedLike(el) {
        const ac = el.getAttribute('aria-checked');
        if (ac === 'true') return true;
        if (ac === 'false') return false;
        const ap = el.getAttribute('aria-pressed');
        if (ap === 'true') return true;
        const as = el.getAttribute('aria-selected');
        if (as === 'true') return true;
        const cls = (el.className && el.className.toString ? el.className.toString() : '').toLowerCase();
        // 단어 경계로 상태 클래스 탐지 (checked, active, selected, on, is-checked 등)
        if (/(^|[\s_-])(checked|selected|active|is-checked|is-active|is-selected|on)([\s_-]|$)/.test(cls)) return true;
        return null;
    }

    // 보이는 라벨/래퍼가 있는지 (숨겨진 input이 클릭 가능한지 판단)
    function hasVisibleProxy(el) {
        // 부모/조상 중 클릭 가능한 보이는 래퍼
        let p = el.parentElement;
        for (let i = 0; i < 3 && p; i++) {
            if (isVisible(p)) return true;
            p = p.parentElement;
        }
        // for 속성으로 연결된 label
        if (el.id) {
            const lab = document.querySelector(`label[for="${el.id}"]`);
            if (lab && isVisible(lab)) return true;
        }
        return false;
    }

    // 라벨 텍스트 정제: 설명 문구 제거 (줄바꿈 뒤는 보통 설명)
    function cleanLabel(rawLabel) {
        if (!rawLabel) return '';
        const lines = rawLabel.split(/[\n\r]/);
        let mainLabel = lines[0].trim();
        // 괄호 안 짧은 힌트는 유지, 너무 긴 괄호 설명은 제거
        if (mainLabel.length > 80) {
            mainLabel = mainLabel.slice(0, 80);
        }
        return mainLabel;
    }

    // 입력 요소에 연결된 라벨 텍스트를 여러 방법으로 추정 (커스텀 폼 대응)
    function findFieldLabel(el) {
        // 1. label[for=id]
        if (el.id) {
            try {
                const l = document.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(el.id) : el.id) + '"]');
                if (l && l.innerText.trim()) return l.innerText.trim();
            } catch (_) {}
        }
        // 2. 감싸는 label
        const wrap = el.closest('label');
        if (wrap && wrap.innerText.trim()) return wrap.innerText.trim();
        // 3. aria-labelledby
        const lb = el.getAttribute('aria-labelledby');
        if (lb) {
            const parts = lb.split(/\s+/).map(id => {
                const n = document.getElementById(id);
                return n ? n.innerText.trim() : '';
            }).filter(Boolean);
            if (parts.length) return parts.join(' ');
        }
        // 4. aria-label
        const aria = el.getAttribute('aria-label');
        if (aria && aria.trim()) return aria.trim();
        // 5. fieldset > legend
        const fs = el.closest('fieldset');
        if (fs) {
            const leg = fs.querySelector(':scope > legend');
            if (leg && leg.innerText.trim()) return leg.innerText.trim();
        }
        // 6. 테이블 행 안에 있으면 같은 행의 th 텍스트
        const tr = el.closest('tr');
        if (tr) {
            const th = tr.querySelector('th');
            if (th && th.innerText.trim()) return th.innerText.trim();
        }
        // 7. 상위 컨테이너 안의 라벨/제목성 요소 (React/MUI 폼 대응)
        let node = el.parentElement;
        for (let depth = 0; depth < 6 && node; depth++) {
            const cand = node.querySelector(':scope > label, :scope > legend, :scope > [class*="label"], :scope > [class*="Label"], :scope > [class*="form-label"], :scope > [class*="field-label"], :scope > [class*="title"], :scope > [class*="Title"], :scope > [class*="question"], :scope > [class*="Question"], :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > span, :scope > dt, :scope > em, :scope > strong');
            if (cand && !cand.contains(el) && cand !== el) {
                const t = (cand.innerText || '').trim();
                if (t && t.length <= 60 && t.length >= 2) return t;
            }
            // 상위 노드의 모든 자손 중 필드명 키워드가 포함된 텍스트 노드 검색
            const allText = (node.innerText || '').replace(/\s+/g, ' ');
            const fieldKeywords = ['생년월일', '입사일', '퇴사일', '입학', '졸업', '시작일', '종료일', '근무기간', '재학기간', '생일', 'date of birth', 'birth date'];
            for (const kw of fieldKeywords) {
                if (allText.includes(kw)) {
                    // 키워드가 발견되면 상위 노드의 직계 텍스트만 반환
                    const directText = Array.from(node.childNodes)
                        .filter(n => n.nodeType === 3 && n.textContent.trim())
                        .map(n => n.textContent.trim())
                        .join(' ');
                    if (directText && directText.length <= 60 && directText.length >= 2) return directText;
                }
            }
            node = node.parentElement;
        }
        // 8. 부모의 이전 형제 컨테이너 (label-input 분리 레이아웃 대응)
        let parentNode = el.parentElement;
        for (let pDepth = 0; pDepth < 3 && parentNode; pDepth++) {
            let pPrev = parentNode.previousElementSibling;
            let pHops = 0;
            while (pPrev && pHops < 2) {
                const t = (pPrev.innerText || '').trim();
                if (t && t.length <= 60 && t.length >= 2) return t;
                pPrev = pPrev.previousElementSibling;
                pHops++;
            }
            parentNode = parentNode.parentElement;
        }
        // 9. 직전 형제의 텍스트
        let prev = el.previousElementSibling;
        let hops = 0;
        while (prev && hops < 3) {
            const t = (prev.innerText || '').trim();
            if (t && t.length <= 60 && t.length >= 2) return t;
            prev = prev.previousElementSibling;
            hops++;
        }
        // 10. name/id 속성 (placeholder보다 우선)
        const nm = el.getAttribute('name');
        if (nm) return nm.replace(/[_-]/g, ' ').replace(/([A-Z])/g, ' $1').trim();
        const idVal = el.getAttribute('id');
        if (idVal) return idVal.replace(/[_-]/g, ' ').replace(/([A-Z])/g, ' $1').trim();
        // 11. placeholder (제너릭은 최후 수단)
        const ph = el.getAttribute('placeholder');
        if (ph && ph.trim()) return ph.trim();
        return '';
    }

    const elements = [];
    let index = 0;
    for (const el of candidates) {
        const tag = el.tagName.toLowerCase();
        const type = (el.getAttribute('type') || '').toLowerCase();
        const roleAttr = (el.getAttribute('role') || '').toLowerCase();
        const isCheckable = type === 'checkbox' || type === 'radio' ||
            roleAttr === 'checkbox' || roleAttr === 'radio' || roleAttr === 'switch';

        // 커스텀 스타일로 숨겨진 체크박스/라디오는 클릭 가능하므로 보이는 래퍼가 있으면 포함
        if (!isVisible(el)) {
            if (!(isCheckable && hasVisibleProxy(el))) continue;
        }
        if (el.disabled) continue;

        el.setAttribute(ATTR, String(index));
        let text = (el.innerText || el.getAttribute('aria-label') || '').trim();
        text = text.replace(/\s+/g, ' ').slice(0, 100);

        // 입력 요소의 연결된 라벨 텍스트 찾기 (폼 자동작성 정확도 향상)
        const isField = (tag === 'input' || tag === 'textarea' || tag === 'select');
        let label = '';
        if (isField) {
            label = cleanLabel(findFieldLabel(el)).replace(/\s+/g, ' ').slice(0, 80);
        }

        // 숨겨진 커스텀 체크박스/라디오: 연결된 라벨/래퍼 텍스트로 text 보강
        if ((isCheckable) && (!text || text.length < 2)) {
            if (el.id) {
                const lab = document.querySelector(`label[for="${el.id}"]`);
                if (lab) text = (lab.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 100);
            }
            if (!text || text.length < 2) {
                const wrap = el.closest('label, [class*="checkbox"], [class*="radio"], [class*="check"], li');
                if (wrap) text = (wrap.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 100);
            }
        }

        // 소속 그룹(섹션)명 추출 — 하드코딩 없이 LLM이 스스로 판단
        let group = '';
        if (isField || isCheckable) {
            const groupEl = el.closest('fieldset, [class*="section"], [class*="group"], [class*="field"], tr, [class*="row"], [class*="form"], li, [role="group"]');
            if (groupEl) {
                // 1) legend / th / 헤더성 자식 요소
                const header = groupEl.querySelector(':scope > legend, :scope > th, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > [class*="title"], :scope > [class*="label"], :scope > [class*="heading"]');
                if (header && !header.contains(el)) {
                    const ht = (header.innerText || '').trim().slice(0, 40);
                    if (ht && ht.length >= 2) group = ht;
                }
                // 2) 부모의 이전 형제 (label-input 분리 레이아웃)
                if (!group) {
                    let pPrev = groupEl.previousElementSibling;
                    let pH = 0;
                    while (pPrev && pH < 2) {
                        const pt = (pPrev.innerText || '').trim().slice(0, 40);
                        if (pt && pt.length >= 2 && pt.length <= 40) { group = pt; break; }
                        pPrev = pPrev.previousElementSibling;
                        pH++;
                    }
                }
            }
        }

        // 체크박스/라디오 체크 상태 (네이티브 → 커스텀 class/aria 순)
        let checked = null;
        if (type === 'checkbox' || type === 'radio') {
            checked = !!el.checked;
            // 네이티브가 숨겨져 .checked가 부정확할 수 있으니 래퍼 class도 확인
            if (!checked) {
                const wrap = el.closest('label, [class*="checkbox"], [class*="radio"], [class*="check"]');
                if (wrap && isCheckedLike(wrap) === true) checked = true;
            }
        } else if (isCheckable) {
            // 커스텀 위젯 (role=checkbox/radio/switch)
            const c = isCheckedLike(el);
            checked = c === null ? false : c;
        }

        // select 옵션 목록
        let options = '';
        if (tag === 'select') {
            options = Array.from(el.options || [])
                .map(o => (o.text || '').trim())
                .filter(Boolean)
                .slice(0, 30)
                .join(' | ');
        }

        elements.push({
            index: index,
            tag: tag,
            type: type,
            role: el.getAttribute('role') || '',
            name: el.getAttribute('name') || '',
            placeholder: el.getAttribute('placeholder') || '',
            label: label,
            value: (el.value || '').slice(0, 60),
            checked: checked,
            options: options,
            ariaExpanded: el.getAttribute('aria-expanded') || '',
            ariaSelected: el.getAttribute('aria-selected') || '',
            ariaHasPopup: el.getAttribute('aria-haspopup') || '',
            text: text,
            group: group
        });
        index++;
        if (index >= 180) break; // 토큰 절약
    }

    // 페이지 본문 텍스트 (분석/요약용, 토큰 절약 위해 잘라냄)
    let pageText = '';
    try {
        const main = document.querySelector('main, #main, #search, [role="main"]') || document.body;
        pageText = (main.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 3000);
    } catch (_) {}

    return {
        url: window.location.href,
        title: document.title,
        elements: elements,
        pageText: pageText
    };
}

// 인덱스 기반 액션 실행
function pageActionExecutor(action) {
    const ATTR = 'data-agent-idx';

    function getEl(idx) {
        return document.querySelector('[' + ATTR + '="' + idx + '"]');
    }

    try {
        if (action.action === 'scroll') {
            const amount = (action.direction === 'up' ? -1 : 1) * window.innerHeight * 0.8;
            window.scrollBy({ top: amount, behavior: 'smooth' });
            return { success: true };
        }

        const el = getEl(action.index);
        if (!el) {
            return { success: false, error: `인덱스 [${action.index}] 요소를 찾을 수 없습니다` };
        }

        // 화면에 보이도록 스크롤
        el.scrollIntoView({ block: 'center', behavior: 'instant' });

        if (action.action === 'click') {
            // React / MUI / custom 위젯 호환: 전체 포인터/마우스 시퀀스 디스패치
            const rect = el.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            const getOpts = (type) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerType: 'mouse' });
            el.dispatchEvent(new PointerEvent('pointerdown', getOpts()));
            el.dispatchEvent(new MouseEvent('mousedown', getOpts()));
            el.dispatchEvent(new PointerEvent('pointerup', getOpts()));
            el.dispatchEvent(new MouseEvent('mouseup', getOpts()));
            el.click();
            return { success: true };
        }

        if (action.action === 'input') {
            // ===== 날짜 필드 자동 처리 =====
            const dateInfo = parseDateInput(el, action.text);
            if (dateInfo) {
                return applyDateValue(el, dateInfo);
            }

            // ===== 일반 입력 처리 =====
            el.focus();
            // React 등 프레임워크 호환: native setter 사용
            const proto = el.tagName === 'TEXTAREA'
                ? window.HTMLTextAreaElement.prototype
                : window.HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
            setter.call(el, action.text);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true };
        }

        // ===== 날짜 관련 헬퍼 함수들 =====
        function parseDateInput(el, text) {
            // 입력 값 전체가 완전한 날짜 패턴(YYYY.MM.DD/YYYY-MM-DD/YYYY/MM/DD)이면 날짜 필드로 처리.
            // 동적 datepicker는 type=text + placeholder 없는 경우가 많으므로, 값 형식만으로 판단(하드코딩 없음).
            const trimmed = (text || '').trim();
            const full = trimmed.match(/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})$/);
            if (full) {
                return { year: full[1], month: full[2].padStart(2, '0'), day: full[3].padStart(2, '0') };
            }
            return null;
        }

        function applyDateValue(el, { year, month, day }) {
            const iso = `${year}-${month}-${day}`;
            const dot = `${year}.${month}.${day}`;
            const compact = `${year}${month}${day}`;

            // 1. 동적 datepicker 활성화: click 먼저 (클래스 변경 트리거)
            el.click();
            el.focus();

            // 2. 주요 datepicker 라이브러리 API 자동 탐지
            const dateObj = new Date(Number(year), Number(month) - 1, Number(day));

            // jQuery UI Datepicker
            if (window.jQuery && (el.classList.contains('hasDatepicker') || window.jQuery(el).data('datepicker'))) {
                try {
                    window.jQuery(el).datepicker('setDate', dateObj);
                    return { success: true, detail: `날짜 입력 (jQuery UI): ${iso}` };
                } catch (e) {}
            }

            // flatpickr
            if (el._flatpickr) {
                try {
                    el._flatpickr.setDate(iso, true);
                    return { success: true, detail: `날짜 입력 (flatpickr): ${iso}` };
                } catch (e) {}
            }

            // Bootstrap Datepicker
            if (window.jQuery && (el.dataset && el.dataset.provide === 'datepicker' || el.classList.contains('datepicker'))) {
                try {
                    window.jQuery(el).datepicker('update', iso);
                    return { success: true, detail: `날짜 입력 (Bootstrap): ${iso}` };
                } catch (e) {}
            }

            // Pikaday
            if (el._pikaday) {
                try {
                    el._pikaday.setDate(dateObj);
                    return { success: true, detail: `날짜 입력 (Pikaday): ${iso}` };
                } catch (e) {}
            }

            // 3. 형식 추정: placeholder / value / data-format / class 에서 힌트 파악
            const hint = (el.placeholder || el.value || el.getAttribute('data-format') || '').trim();
            const cls = (el.className || '').toLowerCase();
            const labelHint = (el.getAttribute('aria-label') || el.name || el.id || '').toLowerCase();

            let formatted = dot; // 기본: YYYY.MM.DD

            if (el.type === 'date') {
                formatted = iso;
            } else if (/yyyymmdd/i.test(hint) || /yyyymmdd/i.test(cls)) {
                formatted = compact;
            } else if (/yyyy[^\d]?mm[^\d]?dd/i.test(hint)) {
                formatted = dot;
            } else if (/yyyy[^\d]?mm/i.test(hint) && !/dd/i.test(hint)) {
                formatted = `${year}.${month}`;
            } else if (hint.includes('-') || labelHint.includes('yyyy-mm-dd')) {
                formatted = iso;
            } else if (cls.includes('ymd') || cls.includes('date')) {
                // class명에서 형식 추정
                if (cls.includes('ymd')) formatted = compact;
                else if (cls.includes('hyphen') || cls.includes('dash')) formatted = iso;
            }

            // 4. Native setter + comprehensive events (fallback)
            const proto = el.tagName === 'TEXTAREA'
                ? window.HTMLTextAreaElement.prototype
                : window.HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
            setter.call(el, formatted);

            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', bubbles: true }));
            el.dispatchEvent(new Event('blur', { bubbles: true }));

            return { success: true, detail: `날짜 입력 (native): ${formatted}` };
        }

        if (action.action === 'select') {
            const want = (action.text || '').trim();
            if (el.tagName === 'SELECT') {
                const opts = Array.from(el.options);
                const norm = s => (s || '').trim().toLowerCase();
                let match = opts.find(o => norm(o.text) === norm(want))
                    || opts.find(o => norm(o.text).includes(norm(want)) && want)
                    || opts.find(o => norm(o.value) === norm(want));
                if (!match) {
                    return { success: false, error: `'${want}' 옵션을 찾지 못했습니다` };
                }
                const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
                setter.call(el, match.value);
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return { success: true };
            }
            // 커스텀 드롭다운(div 기반): 우선 클릭으로 펼침
            el.click();
            return { success: true };
        }

        if (action.action === 'submit') {
            el.focus();
            el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', keyCode: 13, bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
            // form이 있으면 제출 시도
            const form = el.closest('form');
            if (form) {
                form.requestSubmit ? form.requestSubmit() : form.submit();
            }
            return { success: true };
        }

        return { success: false, error: `알 수 없는 액션: ${action.action}` };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ===== 사용자 행동 학습 옵저버 (페이지 컨텍스트) =====
// 사용자가 웹에서 직접 필드를 채우거나 클릭할 때 감지하여 학습 패턴으로 기록
function userActionObserver() {
    const ATTR = 'data-agent-idx';
    const DEBOUNCE_MS = 2000;
    let pending = new Map();

    function getFieldMeta(el) {
        const tag = el.tagName.toLowerCase();
        const type = (el.getAttribute('type') || '').toLowerCase();
        const role = (el.getAttribute('role') || '').toLowerCase();
        const idx = el.getAttribute(ATTR) || '';

        // 라벨/그룹 찾기 (pageStateCollector의 로직 재사용)
        let label = '';
        let group = '';
        const id = el.id;
        if (id) {
            const lab = document.querySelector('label[for="' + id + '"]');
            if (lab) label = (lab.innerText || '').trim().slice(0, 60);
        }
        if (!label) {
            const wrap = el.closest('label');
            if (wrap) label = (wrap.innerText || '').trim().slice(0, 60);
        }
        if (!label) {
            let prev = el.previousElementSibling;
            for (let i = 0; i < 3 && prev; i++) {
                const t = (prev.innerText || '').trim();
                if (t && t.length < 80) { label = t.slice(0, 60); break; }
                prev = prev.previousElementSibling;
            }
        }
        const wrap = el.closest('fieldset, .form-group, [class*="group"], [class*="section"], [class*="item"]');
        if (wrap) group = (wrap.querySelector('legend, .title, .heading, [class*="title"]')?.innerText || wrap.innerText || '').trim().slice(0, 60);

        return { idx, tag, type, role, label, group, name: el.name || '', placeholder: el.placeholder || '' };
    }

    function inferResumeKey(meta, value) {
        // 단순 휴리스틱으로 이력서 키와 매칭 시도
        const l = (meta.label + ' ' + meta.name + ' ' + meta.placeholder).toLowerCase();
        const v = (value || '').trim();
        const keys = [];

        if (/성명|이름|name/.test(l)) keys.push('name');
        if (/이메일|email|메일/.test(l)) keys.push('email');
        if (/전화|휴대폰|phone|tel/.test(l)) keys.push('phone');
        if (/주소|address|거주/.test(l)) keys.push('address');
        if (/생년|생일|birth|주민/.test(l)) keys.push('birthdate');
        if (/학교|school|대학/.test(l)) keys.push('education[0].school');
        if (/전공|major|학과/.test(l)) keys.push('education[0].major');
        if (/학위|degree/.test(l)) keys.push('education[0].degree');
        if (/졸업|status|재학/.test(l)) keys.push('education[0].status');
        if (/회사|company|근무|직장/.test(l)) keys.push('experience[0].company');
        if (/직급|직책|role|직무|position/.test(l)) keys.push('experience[0].role');
        if (/부서|department|팀/.test(l)) keys.push('experience[0].department');
        if (/고용형태|고용|계약/.test(l)) keys.push('experience[0].employment_type');
        if (/병역|군필|군별|계급|병과/.test(l)) {
            if (/군별|branch|군종/.test(l)) keys.push('military_service.branch');
            else if (/계급|rank|병장|상병/.test(l)) keys.push('military_service.rank');
            else if (/병과|specialty|MOS/.test(l)) keys.push('military_service.specialty');
            else if (/상태|status|필|면제/.test(l)) keys.push('military_service.status');
            else keys.push('military_service');
        }
        if (/자기소개|성장|장단점|지원동기|포부/.test(l)) keys.push('self_introduction');
        if (/기술|skill|보유기술/.test(l)) keys.push('skills');
        if (/자격|certification|면허/.test(l)) keys.push('certifications');

        // 값의 형태로 추가 검증
        if (/\d{4}[.\/\-]\d{1,2}[.\/\-]\d{1,2}/.test(v) && !keys.includes('birthdate')) keys.push('birthdate');
        if (/010[\-]?\d{3,4}[\-]?\d{4}/.test(v) && !keys.includes('phone')) keys.push('phone');
        if (v.includes('@') && !keys.includes('email')) keys.push('email');

        return keys;
    }

    function inferActionType(meta, el) {
        if (meta.tag === 'select') return 'select';
        if (meta.role === 'combobox' || el.getAttribute('aria-haspopup')) return 'click_then_select';
        if (meta.type === 'checkbox' || meta.type === 'radio' || meta.role === 'checkbox' || meta.role === 'radio') return 'click';
        if (meta.tag === 'textarea') return 'textarea';
        return 'input';
    }

    function recordAction(el, value, actionType) {
        const meta = getFieldMeta(el);
        if (!meta.idx && !meta.label) return;

        const keys = inferResumeKey(meta, value);
        if (keys.length === 0) return;

        const pattern = {
            signature: {
                label: meta.label,
                group: meta.group,
                tag: meta.tag,
                type: meta.type,
                role: meta.role,
                name: meta.name,
                placeholder: meta.placeholder
            },
            action_type: actionType,
            value_hint: value.slice(0, 100),
            inferred_keys: keys,
            timestamp: Date.now()
        };

        // chrome.storage에 저장 (sidepanel과 통신)
        // content script는 chrome.storage 직접 접근 가능
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.get(['learnedPatterns'], (res) => {
                const patterns = (res && res.learnedPatterns) || [];
                // 중복 제거: 같은 signature가 있으면 업데이트
                const existingIdx = patterns.findIndex(p =>
                    p.signature.label === pattern.signature.label &&
                    p.signature.group === pattern.signature.group &&
                    p.signature.tag === pattern.signature.tag
                );
                if (existingIdx >= 0) {
                    patterns[existingIdx] = pattern;
                } else {
                    patterns.push(pattern);
                }
                // 최대 50개 유지
                if (patterns.length > 50) patterns.shift();
                chrome.storage.local.set({ learnedPatterns: patterns });
            });
        }
    }

    // 입력 감지 (debounce)
    document.addEventListener('input', (e) => {
        const el = e.target;
        if (!el.matches('input, textarea, select, [contenteditable="true"]')) return;
        const key = el.getAttribute(ATTR) || el.name || el.id || Math.random().toString();
        if (pending.has(key)) clearTimeout(pending.get(key));
        const timer = setTimeout(() => {
            pending.delete(key);
            const val = el.value || el.innerText || '';
            if (val.trim()) {
                const actionType = inferActionType(getFieldMeta(el), el);
                recordAction(el, val, actionType);
                console.log('[Learn] Recorded:', actionType, val.slice(0, 30));
            }
        }, DEBOUNCE_MS);
        pending.set(key, timer);
    }, true);

    // 클릭 감지 (체크박스/라디오/드롭다운)
    document.addEventListener('click', (e) => {
        const el = e.target.closest('input, [role="checkbox"], [role="radio"], [role="combobox"], [role="option"], [role="menuitem"], [class*="dropdown"]');
        if (!el) return;
        const meta = getFieldMeta(el);
        const actionType = inferActionType(meta, el);
        // 클릭 후 상태 변화를 보기 위해 약간 딜레이
        setTimeout(() => {
            let val = '';
            if (meta.type === 'checkbox' || meta.role === 'checkbox') val = el.checked ? 'checked' : 'unchecked';
            else if (meta.role === 'option' || meta.role === 'menuitem') val = (el.innerText || '').trim();
            else if (el.tagName === 'SELECT') val = el.options[el.selectedIndex]?.text || '';
            if (val) {
                recordAction(el, val, actionType);
                console.log('[Learn] Click recorded:', actionType, val.slice(0, 30));
            }
        }, 300);
    }, true);

    console.log('[Learn] User action observer started');
}
