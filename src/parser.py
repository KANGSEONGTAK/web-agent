from src.llm import LLMClient
from src.prompts import SYSTEM_PROMPT, RESUME_FILLING_GUIDE, FIELD_MAPPING_PROMPT
import json
from typing import Dict, Any, List


class TaskParser:
    def __init__(self):
        self.llm = LLMClient(use_cache=False)

    def decide_next_action(
        self,
        goal: str,
        url: str,
        title: str,
        elements: List[Dict[str, Any]],
        history: List[Dict[str, Any]],
        page_text: str = "",
        sensitive_approved: bool = False,
        conversation: List[Dict[str, Any]] = None,
        resume_profile: Dict[str, Any] = None,
    ) -> Dict[str, Any]:
        """현재 페이지 상태를 기반으로 다음 액션 1개를 결정 (에이전트 루프의 한 스텝)."""

        elements_summary = self._format_elements(elements)
        history_summary = self._format_history(history)
        conversation_summary = self._format_conversation(conversation)
        resume_block = self._format_resume(resume_profile)

        approval_note = ""
        if sensitive_approved:
            approval_note = (
                "\n[중요] 사용자가 민감 작업(로그인/회원가입/인증/결제)을 이미 승인했습니다. "
                "이번 스텝에서는 ask로 멈추지 말고 해당 작업을 실제로 진행(click/input/submit)하세요.\n"
            )

        page_text_block = ""
        if page_text:
            page_text_block = f"[현재 페이지 본문 내용 (분석/요약에 활용)]\n{page_text[:3000]}\n\n"

        method_note = ""
        if self._is_method_question(goal) and page_text:
            method_note = (
                "\n[이번 스텝 필수 지시] 이 목표는 '방법/가능 여부'를 묻는 질문이며, 위 본문에 이미 방법 단서가 있습니다. "
                "click/input/submit으로 로그인·인증·조회를 직접 수행하지 말고, 반드시 answer 액션으로 "
                "어느 사이트에서 무엇을 어떻게 하면 되는지 단계별로 안내하세요.\n"
            )

        conversation_block = ""
        if conversation_summary:
            conversation_block = (
                f"[이전 대화 내용]\n{conversation_summary}\n"
                f"(현재 목표의 '그 사이트', '거기', '아까 그것' 같은 표현은 위 대화를 참고해 구체적으로 해석하세요.)\n\n"
            )

        user_prompt = (
            f"{conversation_block}"
            f"[현재 목표]\n{goal}\n\n"
            f"[현재 페이지]\nURL: {url}\n제목: {title}\n\n"
            f"[지금까지 수행한 액션]\n{history_summary}\n"
            f"{approval_note}"
            f"{method_note}\n"
            f"{resume_block}"
            f"{page_text_block}"
            f"[상호작용 가능한 요소 목록]\n{elements_summary}\n\n"
            f"위 정보를 바탕으로 다음에 수행할 단 하나의 액션을 JSON으로 반환하세요."
        )

        response = self.llm._call_llm(SYSTEM_PROMPT, user_prompt, use_json=True)

        try:
            return json.loads(response)
        except Exception:
            return {
                "thought": "응답 파싱 실패",
                "action": "ask",
                "message": "요청을 처리하지 못했습니다. 다시 말씀해 주시겠어요?",
            }

    def _format_resume(self, resume_profile: Dict[str, Any]) -> str:
        """이력서 프로필을 폼 자동작성용 블록으로 포맷."""
        if not resume_profile:
            return ""
        try:
            profile_json = json.dumps(resume_profile, ensure_ascii=False, indent=2)
        except Exception:
            profile_json = str(resume_profile)
        return (
            "========================================\n"
            "[사용자 이력서 프로필 - 이 데이터로 폼을 채우세요]\n"
            "========================================\n"
            f"{profile_json}\n"
            "========================================\n\n"
            f"{RESUME_FILLING_GUIDE}\n"
        )

    def _format_conversation(self, conversation: List[Dict[str, Any]]) -> str:
        if not conversation:
            return ""
        lines = []
        for turn in conversation[-6:]:
            role = "사용자" if turn.get("role") == "user" else "AI"
            content = (turn.get("content") or "").strip().replace("\n", " ")[:300]
            if content:
                lines.append(f"{role}: {content}")
        return "\n".join(lines)

    def _is_method_question(self, goal: str) -> bool:
        """'방법/가능 여부'를 묻는 질문인지 판별 (실제 실행이 아닌 안내가 목적)."""
        g = goal.replace(" ", "")
        method_kw = ["방법", "어떻게", "알수있", "알수잇", "할수있", "할수잇", "있을까", "잇을까", "있어?", "잇어?", "있나", "잇나", "가능해", "가능한가", "되나요", "알려줘"]
        action_kw = ["직접", "대신", "방문", "접속", "들어가", "이동", "가줘", "가봐", "열어", "조회해줘", "해줘", "해줄", "로그인해", "가입해", "신청해", "예약해", "주문해", "결제해"]
        has_method = any(k in g for k in method_kw)
        has_action = any(k in g for k in action_kw)
        return has_method and not has_action

    def _format_elements(self, elements: List[Dict[str, Any]]) -> str:
        if not elements:
            return "(상호작용 가능한 요소 없음)"

        def _format_one(el):
            idx = el.get("index")
            tag = el.get("tag", "")
            el_type = el.get("type", "")
            text = (el.get("text") or "").strip().replace("\n", " ")[:80]
            name = el.get("name", "")
            placeholder = el.get("placeholder", "")
            label = (el.get("label") or "").strip().replace("\n", " ")[:60]
            value = (el.get("value") or "").strip().replace("\n", " ")[:60]
            role = el.get("role", "")
            checked = el.get("checked", None)
            options = (el.get("options") or "").strip()[:200]
            ariaHasPopup = el.get("ariaHasPopup", "")

            desc = f"[{idx}]"
            if label:
                desc += f" 라벨='{label}'"
            desc += f" <{tag}"
            if el_type:
                desc += f" type={el_type}"
            if role:
                desc += f" role={role}"
            if name:
                desc += f" name='{name}'"
            if placeholder:
                desc += f" placeholder='{placeholder}'"
            if value:
                desc += f" 현재값='{value}'"
            if checked is not None:
                desc += f" 체크됨={'예' if checked else '아니오'}"
            if options:
                desc += f" 옵션=[{options}]"
            ariaExpanded = el.get("ariaExpanded")
            if ariaExpanded:
                desc += f" 열림={ariaExpanded}"
            ariaSelected = el.get("ariaSelected")
            if ariaSelected:
                desc += f" 선택됨={ariaSelected}"
            if ariaHasPopup:
                desc += f" 팝업={ariaHasPopup}"
            group = el.get("group", "")
            if group:
                desc += f" 그룹='{group}'"
            desc += ">"
            if text:
                desc += f" {text}"
            return desc

        fields = []
        others = []
        for el in elements:
            tag = el.get("tag", "")
            role = el.get("role", "")
            is_field = tag in ("input", "textarea", "select") or role in ("combobox", "checkbox", "radio", "switch", "spinbutton")
            if is_field:
                fields.append(_format_one(el))
            else:
                others.append(_format_one(el))

        result = []
        result.append(f"[총 {len(elements)}개 요소 / 입력필드 {len(fields)}개 / 기타 {len(others)}개]")
        if fields:
            result.append("--- 입력 필드 (채워야 할 칸) ---")
            result.extend(fields)
        if others:
            result.append("--- 버튼/링크/기타 ---")
            result.extend(others)
        return "\n".join(result)

    def _format_history(self, history: List[Dict[str, Any]]) -> str:
        if not history:
            return "(없음 - 첫 스텝)"
        lines = []
        for i, step in enumerate(history[-8:], 1):
            action = step.get("action", "")
            detail = step.get("detail", "")
            lines.append(f"{i}. {action} {detail}".strip())
        return "\n".join(lines)

    def map_fields(
        self,
        elements: List[Dict[str, Any]],
        resume_profile: Dict[str, Any],
        learned_prompt: str = "",
    ) -> Dict[str, Any]:
        """빈 입력 필드들을 이력서 데이터와 일괄 매칭 (Two-Pass의 Pass 1)."""
        elements_summary = self._format_elements(elements)
        resume_block = self._format_resume(resume_profile)

        user_prompt = (
            f"{learned_prompt}\n"
            f"{resume_block}\n"
            f"[빈 입력 필드 목록]\n{elements_summary}\n\n"
            f"위 필드들을 이력서 데이터와 매칭하세요. JSON으로 반환하세요."
        )

        response = self.llm._call_llm(FIELD_MAPPING_PROMPT, user_prompt, use_json=True)

        try:
            parsed = json.loads(response)
            mappings = parsed.get("mappings", [])
            unmatched = parsed.get("unmatched", [])
            return {
                "mappings": mappings,
                "unmatched": unmatched,
                "matched_count": len(mappings),
            }
        except Exception as e:
            return {
                "mappings": [],
                "unmatched": [],
                "error": str(e),
                "raw_response": response[:500] if isinstance(response, str) else "",
            }
