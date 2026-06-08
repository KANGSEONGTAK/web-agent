// ===== Web-Agent: 범용 자동입력 엔진 =====
// React/Ant Design/Custom 컴포넌트 지원 + 라벨 기반 필드 탐색
// 특정 사이트에 종속되지 않도록 범용 설계

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'autofill') {
        autofillForm(request.data).then(result => {
            sendResponse({ status: 'success', result });
        });
        return true; // async sendResponse
    }
    if (request.action === 'getFormFields') {
        sendResponse({ fields: detectFormFields() });
    }
});

// ===== 공통 유틸리티 =====

const sleep = ms => new Promise(r => setTimeout(r, ms));

// NBSP 정규화: ninehire 등 커스텀 라벨에서 \u00A0(NBSP) 사용
function norm(s) {
    return (s || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
}

// 네이티브 value setter (React 우회)
const nativeInputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
const nativeTextareaSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;

function setNativeValue(el, value) {
    const setter = el.tagName === 'TEXTAREA' ? nativeTextareaSetter : nativeInputSetter;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
}

// 실제 클릭 이벤트 시퀀스 (Ant Design 등 포인터 이벤트 의존 컴포넌트용)
function realClick(el) {
    const r = el.getBoundingClientRect();
    const opts = {
        bubbles: true, cancelable: true, view: window,
        clientX: r.left + r.width / 2, clientY: r.top + r.height / 2
    };
    ['pointerover', 'pointerenter', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']
        .forEach(type => {
            const Ctor = type.startsWith('pointer') ? PointerEvent : MouseEvent;
            el.dispatchEvent(new Ctor(type, opts));
        });
}

// ===== 라벨 기반 필드 탐색 (범용) =====

// 페이지에서 라벨 역할을 하는 요소들을 모두 수집
function getLabelElements() {
    const labels = [];
    // 1. div.label[contenteditable="false"] (ninehire 스타일)
    document.querySelectorAll('div.label[contenteditable="false"], div[class*="label"][contenteditable="false"]')
        .forEach(el => labels.push(el));
    // 2. 표준 <label> 요소
    document.querySelectorAll('label').forEach(el => labels.push(el));
    // 3. [class*="label"] 중 텍스트만 가진 짧은 요소 (MUI/Chakra 등)
    document.querySelectorAll('[class*="field-label"], [class*="form-label"], [class*="FormLabel"]')
        .forEach(el => labels.push(el));
    return labels;
}

// 라벨 텍스트로 필드 영역(row) 찾기 — 여러 전략 시도
function findFieldRow(labelText, partial = false) {
    const labels = getLabelElements();
    const target = norm(labelText);
    const match = labels.find(el => {
        const t = norm(el.textContent);
        return partial ? t.includes(target) : t === target;
    });
    if (!match) return null;

    // 전략1: 공통 상위 "항목 박스" 찾기 (필드 라벨이 1개인 최상위 조상)
    // 체크박스/라디오를 감싸는 라벨(예: "해당없음")은 필드 라벨로 세지 않음 —
    // 그래야 한 항목 안에 토글 라벨이 있어도 row 범위가 너무 일찍 끊기지 않음
    let node = match;
    while (node.parentElement) {
        const parent = node.parentElement;
        const fieldLabelCount = [...parent.querySelectorAll(
            'div.label[contenteditable="false"], label, [class*="field-label"]'
        )].filter(l => !l.querySelector('input[type="checkbox"], input[type="radio"]')).length;
        if (fieldLabelCount > 1) break;
        node = parent;
    }
    return node;
}

// 필드 row 안에서 입력 가능한 요소 찾기
function findInputInRow(row) {
    if (!row) return null;
    // input (non-checkbox, non-readonly) 또는 textarea
    const el = [...row.querySelectorAll('input, textarea')]
        .find(x => !x.readOnly && x.type !== 'checkbox' && x.type !== 'file' && x.type !== 'hidden');
    return el || null;
}

// ===== Ant Design 드롭다운 핸들러 =====

async function antDropdownSelect(row, optionText) {
    if (!row) return { success: false, error: 'NO_ROW' };
    const trigger = row.querySelector('.ant-dropdown-trigger, [class*="ant-select-selector"], [class*="dropdown-trigger"]');
    if (!trigger) return { success: false, error: 'NO_TRIGGER' };

    // 메뉴 열기
    trigger.click();
    await sleep(350);

    // 열린 메뉴에서 옵션 찾기
    const menuSelectors = [
        '.ant-dropdown:not(.ant-dropdown-hidden) .ant-dropdown-menu-item',
        '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item',
        '.ant-dropdown-menu-item',
        '[class*="dropdown-menu"] [class*="menu-item"]',
        '[role="option"]',
        '[role="menuitem"]'
    ];

    let items = [];
    for (const sel of menuSelectors) {
        items = [...document.querySelectorAll(sel)];
        if (items.length > 0) break;
    }

    if (items.length === 0) {
        document.body.click(); // 메뉴 닫기
        return { success: false, error: 'NO_MENU_ITEMS' };
    }

    const target = norm(optionText);
    const match = items.find(x => norm(x.textContent) === target)
        || items.find(x => norm(x.textContent).includes(target));

    if (!match) {
        document.body.click();
        return { success: false, error: `NO_OPTION: ${optionText}` };
    }

    match.click();
    await sleep(200);
    return { success: true, selected: norm(match.textContent) };
}

// ===== Ant Design DatePicker 핸들러 =====

async function antDatePickerSelect(row, isoDate) {
    if (!row) return { success: false, error: 'NO_ROW' };
    const input = row.querySelector('.ant-picker input, input[placeholder*="날짜"], input[placeholder*="선택"]')
        || row.querySelector('input');
    if (!input) return { success: false, error: 'NO_DATE_INPUT' };

    const [Y, M, D] = isoDate.split('-').map(Number);

    // 캘린더 열기 (포인터 이벤트 시퀀스 필요)
    input.focus();
    realClick(input);
    await sleep(400);

    // 캘린더 패널 확인
    const panel = document.querySelector('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)');
    if (!panel) {
        // fallback: native setter로 직접 입력 시도
        setNativeValue(input, `${Y}.${String(M).padStart(2,'0')}.${String(D).padStart(2,'0')}`);
        return { success: true, method: 'native_fallback' };
    }

    // 연도 패널로 이동
    const yearBtn = panel.querySelector('.ant-picker-year-btn');
    if (yearBtn) {
        yearBtn.click();
        await sleep(300);

        // 목표 연도로 네비게이션
        for (let attempts = 0; attempts < 30; attempts++) {
            const cells = [...panel.querySelectorAll('.ant-picker-cell')];
            const yearCell = cells.find(c => norm(c.textContent) === String(Y));
            if (yearCell) {
                yearCell.click();
                break;
            }
            const firstYear = parseInt(cells[1]?.textContent, 10) || 2020;
            const navBtn = panel.querySelector(
                Y < firstYear ? '.ant-picker-header-super-prev-btn' : '.ant-picker-header-super-next-btn'
            );
            if (navBtn) navBtn.click();
            await sleep(180);
        }
        await sleep(250);
    }

    // 월 선택
    const monthCells = [...panel.querySelectorAll('.ant-picker-cell')];
    const monthCell = monthCells.find(c => norm(c.textContent) === `${M}월`) || monthCells[M - 1];
    if (monthCell) {
        monthCell.click();
        await sleep(250);
    }

    // 일 선택
    const dayCell = panel.querySelector(`.ant-picker-cell[title="${isoDate}"]`);
    if (dayCell) {
        dayCell.click();
        await sleep(200);
        return { success: true, method: 'calendar', value: input.value || isoDate };
    }

    return { success: false, error: 'NO_DAY_CELL' };
}

// ===== "해당없음" 토글 핸들러 =====

async function toggleNA(labelText, partial = false) {
    const row = findFieldRow(labelText, partial);
    if (!row) return { success: false, error: 'NO_ROW' };

    // 1. 네이티브 체크박스 우선
    const nativeCb = [...row.querySelectorAll('input[type="checkbox"]')].find(cb => {
        const lbl = cb.closest('label') || cb.parentElement;
        return lbl && norm(lbl.textContent).includes('해당없음');
    });
    if (nativeCb) {
        nativeCb.click();
        await sleep(150);
        return { success: true, checked: nativeCb.checked };
    }

    // 2. "해당없음" 텍스트를 가진 커스텀 체크박스 래퍼 찾기
    const wrapper = [...row.querySelectorAll('[tabindex], [role="checkbox"], [role="switch"], [class*="heckbox"]')]
        .find(el => norm(el.textContent) === '해당없음')
        || [...row.querySelectorAll('div, span, label')].find(el =>
            norm(el.textContent) === '해당없음' && (el.tabIndex >= 0 || /checkbox/i.test(el.className))
        );

    if (!wrapper) return { success: false, error: 'NO_TOGGLE' };

    // 3. 실제 클릭 핸들러는 보통 내부 "박스" 요소에 있음 (styled-components/Ant 패턴)
    //    래퍼 클릭이 동작하지 않는 경우가 많아 내부 박스를 우선 타겟팅
    const innerBox = wrapper.querySelector('[class*="BasicCheckbox"], [class*="heckbox"] > div, [class*="box" i] > div')
        || wrapper.firstElementChild
        || wrapper;
    realClick(innerBox);
    await sleep(200);
    return { success: true };
}

// ===== 범용 폼 필드 감지 =====

function detectFormFields() {
    const fields = [];
    const labels = getLabelElements();

    for (const labelEl of labels) {
        const text = norm(labelEl.textContent);
        if (!text || text.length < 1 || text.length > 100) continue;

        const row = findFieldRow(text);
        if (!row) continue;

        // 필드 유형 감지
        let type = 'unknown';
        if (row.querySelector('.ant-dropdown-trigger, [class*="dropdown-trigger"]')) {
            type = 'dropdown';
        } else if (row.querySelector('.ant-picker, input[placeholder*="날짜"], input[placeholder*="선택"]')) {
            type = 'date';
        } else if (row.querySelector('input[type="file"]')) {
            type = 'file';
        } else if (row.querySelector('textarea')) {
            type = 'textarea';
        } else if (row.querySelector('input[type="checkbox"]')) {
            type = 'checkbox';
        } else if (row.querySelector('select')) {
            type = 'select';
        } else if (row.querySelector('input:not([type="hidden"]):not([type="file"])')) {
            type = 'text';
        }

        // "해당없음" 토글 존재 여부
        const hasNA = !![...row.querySelectorAll('[tabindex], div, span')]
            .find(el => norm(el.textContent) === '해당없음');

        // 현재 값
        const input = findInputInRow(row);
        const currentValue = input ? input.value : '';
        const dropdown = row.querySelector('.ant-dropdown-trigger, [class*="dropdown-trigger"]');
        const dropdownValue = dropdown ? norm(dropdown.textContent) : '';

        fields.push({
            label: text,
            type,
            hasNA,
            value: currentValue || dropdownValue,
            isEmpty: !currentValue && !dropdownValue
        });
    }
    return fields;
}

// ===== 메인 자동입력 함수 =====

async function autofillForm(data) {
    const results = {};

    for (const [fieldLabel, fieldConfig] of Object.entries(data)) {
        try {
            const config = typeof fieldConfig === 'string'
                ? { value: fieldConfig, type: 'auto' }
                : fieldConfig;

            const { value, type, partial } = config;
            const usePartial = partial || fieldLabel.length > 20;

            if (type === 'na' || value === '해당없음_toggle') {
                // "해당없음" 토글
                results[fieldLabel] = await toggleNA(fieldLabel, usePartial);
                continue;
            }

            const row = findFieldRow(fieldLabel, usePartial);
            if (!row) {
                results[fieldLabel] = { success: false, error: 'FIELD_NOT_FOUND' };
                continue;
            }

            // 자동 유형 감지
            const detectedType = type === 'auto' ? detectFieldType(row) : type;

            switch (detectedType) {
                case 'dropdown':
                    results[fieldLabel] = await antDropdownSelect(row, value);
                    break;
                case 'date':
                    results[fieldLabel] = await antDatePickerSelect(row, value);
                    break;
                case 'select': {
                    const sel = row.querySelector('select');
                    if (sel) {
                        const opt = [...sel.options].find(o => norm(o.text) === norm(value) || norm(o.value) === norm(value));
                        if (opt) {
                            const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
                            setter.call(sel, opt.value);
                            sel.dispatchEvent(new Event('change', { bubbles: true }));
                            results[fieldLabel] = { success: true };
                        } else {
                            results[fieldLabel] = { success: false, error: 'NO_OPTION' };
                        }
                    } else {
                        // Ant dropdown fallback
                        results[fieldLabel] = await antDropdownSelect(row, value);
                    }
                    break;
                }
                default: {
                    // text / textarea
                    const input = findInputInRow(row);
                    if (input) {
                        setNativeValue(input, value);
                        results[fieldLabel] = { success: true };
                    } else {
                        results[fieldLabel] = { success: false, error: 'NO_INPUT' };
                    }
                }
            }
        } catch (e) {
            results[fieldLabel] = { success: false, error: e.message };
        }
    }
    return results;
}

// 필드 row의 컨트롤 유형 자동 감지
function detectFieldType(row) {
    if (row.querySelector('.ant-dropdown-trigger, [class*="ant-select"], [class*="dropdown-trigger"]')) {
        return 'dropdown';
    }
    if (row.querySelector('.ant-picker, [class*="datepicker"]')) {
        return 'date';
    }
    if (row.querySelector('select')) {
        return 'select';
    }
    // readOnly input이면서 날짜 placeholder가 있으면 date
    const input = row.querySelector('input');
    if (input && input.readOnly && /날짜|선택|date/i.test(input.placeholder || '')) {
        return 'date';
    }
    return 'text';
}
