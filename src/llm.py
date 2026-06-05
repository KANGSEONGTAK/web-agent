from openai import OpenAI
from typing import List, Dict, Any, Optional
import os
import hashlib
import json
from functools import lru_cache
from dotenv import load_dotenv

load_dotenv()


class LLMClient:
    def __init__(self, model: str = "gpt-4o-mini", use_cache: bool = True):
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.model = model
        self.use_cache = use_cache
        self.cache: Dict[str, Any] = {}
        self.total_tokens_used = 0
        self.total_cost = 0.0
        
        # 모델별 가격 (1K tokens 기준, USD)
        self.pricing = {
            "gpt-4o": {"input": 0.005, "output": 0.015},
            "gpt-4o-mini": {"input": 0.00015, "output": 0.0006},
            "gpt-3.5-turbo": {"input": 0.0005, "output": 0.0015}
        }

    def _get_cache_key(self, prompt: str) -> str:
        """프롬프트 해시 생성"""
        return hashlib.md5(prompt.encode()).hexdigest()

    def _call_llm(self, system_prompt: str, user_prompt: str, use_json: bool = True) -> str:
        """LLM 호출 및 캐싱"""
        full_prompt = f"{system_prompt}\n{user_prompt}"
        cache_key = self._get_cache_key(full_prompt)
        
        # 캐시 확인
        if self.use_cache and cache_key in self.cache:
            print(f"[CACHE HIT] Using cached response")
            return self.cache[cache_key]
        
        # LLM 호출
        kwargs = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.1
        }
        
        if use_json:
            kwargs["response_format"] = {"type": "json_object"}
        
        response = self.client.chat.completions.create(**kwargs)
        content = response.choices[0].message.content
        
        # 비용 계산
        input_tokens = response.usage.prompt_tokens
        output_tokens = response.usage.completion_tokens
        self.total_tokens_used += input_tokens + output_tokens
        
        pricing = self.pricing.get(self.model, self.pricing["gpt-4o-mini"])
        cost = (input_tokens / 1000) * pricing["input"] + (output_tokens / 1000) * pricing["output"]
        self.total_cost += cost
        
        print(f"[LLM CALL] Tokens: {input_tokens}+{output_tokens}, Cost: ${cost:.4f}")
        
        # 캐시 저장
        if self.use_cache:
            self.cache[cache_key] = content
        
        return content

    def analyze_page(self, page_content: str, elements: List[Dict[str, Any]], user_goal: str) -> Dict[str, Any]:
        """페이지를 분석하고 다음 액션을 결정"""
        
        elements_summary = self._format_elements(elements)
        
        # Prompt 최적화: 불필요한 내용 제거
        prompt = f"Goal: {user_goal}\nElements:\n{elements_summary[:1000]}"
        
        system_prompt = "You are a web automation expert. Determine the next action. Respond with JSON: {\"action_type\": \"navigate|fill|click|wait|done\", \"selector\": \"CSS selector\", \"value\": \"value if fill\", \"reasoning\": \"why\", \"next_goal\": \"updated goal\"}"
        
        content = self._call_llm(system_prompt, prompt, use_json=True)
        print(f"LLM Response: {content[:200]}...")
        return json.loads(content)

    def extract_form_data(self, page_content: str, elements: List[Dict[str, Any]], user_data: Dict[str, str]) -> Dict[str, str]:
        """페이지의 폼 필드와 사용자 데이터를 매칭"""
        
        elements_summary = self._format_elements(elements)
        
        # Prompt 최적화
        prompt = f"Data: {json.dumps(user_data)}\nFields: {elements_summary[:1000]}"
        system_prompt = "Match data to form fields. Respond with JSON mapping selectors to values."
        
        content = self._call_llm(system_prompt, prompt, use_json=True)
        return json.loads(content)

    def get_cost_stats(self) -> Dict[str, Any]:
        """비용 통계 반환"""
        return {
            "total_tokens": self.total_tokens_used,
            "total_cost_usd": round(self.total_cost, 4),
            "model": self.model,
            "cache_size": len(self.cache)
        }

    def clear_cache(self):
        """캐시 비우기"""
        self.cache.clear()
        print("[CACHE] Cleared")

    def _format_elements(self, elements: List[Dict[str, Any]]) -> str:
        formatted = []
        for i, el in enumerate(elements):
            formatted.append(f"{i+1}. {el}")
        return "\n".join(formatted)
