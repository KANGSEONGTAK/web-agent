from src.browser import BrowserController
from src.llm import LLMClient
from typing import Dict, Any, Optional, List


class WebAgent:
    def __init__(self, headless: bool = False, model: str = "gpt-4o-mini", use_cache: bool = True):
        self.browser = BrowserController(headless=headless)
        self.llm = LLMClient(model=model, use_cache=use_cache)
        self.current_goal = ""

    def start(self):
        self.browser.start()

    def stop(self):
        self.browser.stop()

    def navigate(self, url: str):
        self.browser.navigate(url)

    def _try_rule_based_action(self, goal: str, elements: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """간단한 규칙 기반 액션 (LLM 호출 없이)"""
        goal_lower = goal.lower()
        
        # 검색창 채우기 규칙
        if "search" in goal_lower and "fill" not in goal_lower:
            for el in elements:
                if el.get("type") == "input" and el.get("input_type") in ["text", "search", "textarea"]:
                    # 검색어 추출
                    search_term = goal_lower.replace("search for", "").replace("search", "").strip().strip("'\"")
                    if search_term:
                        return {
                            "action_type": "fill",
                            "selector": f"#{el['id']}" if el.get("id") else f"input[name='{el['name']}']",
                            "value": search_term,
                            "reasoning": "Rule-based: Filled search input",
                            "next_goal": f"Submit search for '{search_term}'"
                        }
        
        return None

    def autonomous_execute(self, goal: str, max_steps: int = 10):
        """자율적으로 목표를 달성할 때까지 액션 실행"""
        self.current_goal = goal
        
        for step in range(max_steps):
            print(f"\n--- Step {step + 1}/{max_steps} ---")
            
            # 페이지 상태 수집
            page_content = self.browser.get_text_content()
            elements = self.browser.get_interactive_elements()
            
            print(f"Found {len(elements)} interactive elements")
            
            # 규칙 기반 시도 (비용 절감)
            action = self._try_rule_based_action(self.current_goal, elements)
            if action:
                print(f"[RULE-BASED] {action['action_type']}: {action['reasoning']}")
            else:
                # LLM로 다음 액션 결정
                action = self.llm.analyze_page(page_content, elements, self.current_goal)
                print(f"Action: {action['action_type']}")
                print(f"Reasoning: {action['reasoning']}")
            
            # 액션 실행
            if action["action_type"] == "done":
                print("Goal achieved!")
                break
            
            elif action["action_type"] == "navigate":
                self.browser.navigate(action["selector"])
            
            elif action["action_type"] == "fill":
                if action.get("selector") and action.get("value"):
                    self.browser.fill_input(action["selector"], action["value"])
            
            elif action["action_type"] == "click":
                if action.get("selector"):
                    self.browser.click_element(action["selector"])
            
            elif action["action_type"] == "wait":
                import time
                time.sleep(2)
            
            # 목표 업데이트
            if action.get("next_goal"):
                self.current_goal = action["next_goal"]

    def smart_fill_form(self, data: Dict[str, str]):
        """페이지의 폼을 스마트하게 채움"""
        page_content = self.browser.get_text_content()
        elements = self.browser.get_interactive_elements()
        
        # LLM로 필드 매칭
        field_mapping = self.llm.extract_form_data(page_content, elements, data)
        
        # 필드 채우기
        for selector, value in field_mapping.items():
            print(f"Filling {selector} with {value}")
            self.browser.fill_input(selector, value)

    def click_by_text(self, text: str):
        """텍스트로 버튼/링크 찾아서 클릭"""
        elements = self.browser.get_interactive_elements()
        
        for el in elements:
            if el.get("type") == "clickable" and text.lower() in el.get("text", "").lower():
                if el.get("id"):
                    self.browser.click_element(f"#{el['id']}")
                    return
                # 텍스트로 선택자 생성
                selector = f"{el['tag'].lower()}:text('{text}')"
                self.browser.click_element(selector)
                return

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop()
        # 비용 통계 출력
        stats = self.llm.get_cost_stats()
        print(f"\n=== Cost Statistics ===")
        print(f"Model: {stats['model']}")
        print(f"Total Tokens: {stats['total_tokens']}")
        print(f"Total Cost: ${stats['total_cost_usd']}")
        print(f"Cache Size: {stats['cache_size']}")
