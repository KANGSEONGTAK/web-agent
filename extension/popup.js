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
    loadResumeProfile();
    loadConversation();
});

// 에이전트 설정
const MAX_STEPS = 15;
let agentRunning = false;
let pending = null; // 민감 작업 확인 대기 상태: { goal, history }
let conversation = []; // 대화 맥락: [{ role: 'user'|'assistant', content }]
let resumeProfile = null; // 이력서 프로필 (지원서 자동작성용)

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

    await runAgentLoop(text);
}

// 에이전트 루프: 관찰 → 결정 → 실행 → 반복
// approvedSensitive: 사용자가 직전 민감 작업을 승인한 경우 true (1회성)
async function runAgentLoop(goal, history = [], approvedSensitive = false) {
    agentRunning = true;
    setInputEnabled(false);
    let sensitiveApproved = approvedSensitive;

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
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
        const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId },
            func: pageStateCollector
        });
        last = result;
        if (result && result.elements && result.elements.length > 0) {
            return result;
        }
        await sleep(500); // 로딩 대기 후 재시도
    }
    return last;
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
        // 5. 상위 컨테이너 안의 라벨/제목성 요소 (ninehire 등 React 폼)
        let node = el.parentElement;
        for (let depth = 0; depth < 4 && node; depth++) {
            const cand = node.querySelector('label, legend, [class*="label"], [class*="Label"], [class*="title"], [class*="Title"], [class*="question"], [class*="Question"]');
            if (cand && !cand.contains(el)) {
                const t = (cand.innerText || '').trim();
                if (t && t.length <= 60) return t;
            }
            node = node.parentElement;
        }
        // 6. 직전 형제의 텍스트
        let prev = el.previousElementSibling;
        let hops = 0;
        while (prev && hops < 3) {
            const t = (prev.innerText || '').trim();
            if (t && t.length <= 60) return t;
            prev = prev.previousElementSibling;
            hops++;
        }
        return '';
    }

    const elements = [];
    let index = 0;
    for (const el of candidates) {
        if (!isVisible(el)) continue;
        if (el.disabled) continue;

        el.setAttribute(ATTR, String(index));

        const tag = el.tagName.toLowerCase();
        const type = (el.getAttribute('type') || '').toLowerCase();
        let text = (el.innerText || el.getAttribute('aria-label') || '').trim();
        text = text.replace(/\s+/g, ' ').slice(0, 100);

        // 입력 요소의 연결된 라벨 텍스트 찾기 (폼 자동작성 정확도 향상)
        const isField = (tag === 'input' || tag === 'textarea' || tag === 'select');
        let label = '';
        if (isField) {
            label = findFieldLabel(el).replace(/\s+/g, ' ').slice(0, 80);
        }

        // 체크박스/라디오 체크 상태
        let checked = null;
        if (type === 'checkbox' || type === 'radio') {
            checked = !!el.checked;
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
            text: text
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
