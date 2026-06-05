# Web-Agent

AI 기반 웹 자동화 및 지원서 작성 에이전트 - 웹사이트 자동화 + AI 기반 지원서 작성

## 주요 기능

### 웹 자동화
- 웹페이지 자동 분석
- 폼 자동 채우기
- 버튼/링크 클릭
- 자율적 목표 달성 (autonomous_execute)

### 지원서 작성 (NEW!)
- **PDF 이력서 자동 파싱**: PDF에서 포트폴리오 정보 추출
- **맞춤형 자기소개서 작성**: 채용 공고 분석 후 AI로 자기소개서 작성
- **합격률 향상 팁**: 지원자 강점/개선점 분석
- **지원서 자동 작성**: 브라우저에서 기본 정보 자동 채우기

### 비용 절감 기능
- 저렴한 모델 기본 사용: `gpt-4o-mini` (gpt-4o 대비 97% 저렴)
- 응답 캐싱: 동일한 요청은 재사용
- 규칙 기반 처리: 간단한 작업은 LLM 없이 처리
- Prompt 최적화: 불필요한 context 제거
- 비용 추적: 실시간 토큰/비용 모니터링

## 설치

```bash
pip install -r requirements.txt
```

## 설정

`.env` 파일을 생성하고 API 키를 설정하세요:

```
OPENAI_API_KEY=your_api_key_here
```

## 사용법

### 1. 포트폴리오 설정

```python
from src.portfolio import PortfolioManager

# PDF에서 이력서 가져오기
portfolio = PortfolioManager()
portfolio.import_from_pdf("이력서.pdf")
portfolio.save_to_json()

# 또는 직접 입력
portfolio.update_field("name", "홍길동")
portfolio.update_field("email", "hong@example.com")
```

### 2. 자기소개서 작성

```python
from src.resume_writer import ResumeWriter

writer = ResumeWriter()

job_posting = """
[채용] 백엔드 개발자
- 자격요건: Java 3년 이상, Spring Boot 경험
"""

# 맞춤형 자기소개서 작성
self_intro = writer.generate_self_introduction(
    job_posting, 
    question="본인을 소개해주세요"
)
print(self_intro)

# 합격률 향상 팁
tips = writer.generate_success_tips(job_posting)
print(f"강점: {tips['strengths']}")
```

### 3. 지원서 자동 작성

```python
from src.application_agent import ApplicationAgent

agent = ApplicationAgent(headless=False)

# 채용 공고 분석 + 브라우저에서 자동 채우기
agent.auto_fill_application(
    job_url="https://company.com/apply",
    job_posting_text=job_posting
)
```

### 4. 웹 자동화

```python
from src.agent import WebAgent

with WebAgent(headless=False) as agent:
    agent.navigate("https://google.com")
    agent.autonomous_execute("Search for 'AI automation'", max_steps=5)
```

## 비용 절감

```python
# 기본 설정 (gpt-4o-mini + 캐싱)
with WebAgent(model="gpt-4o-mini", use_cache=True) as agent:
    # ...
```

## 상세 사용법

자세한 사용법은 [USAGE_GUIDE.md](USAGE_GUIDE.md)를 참고하세요.

## 모델별 가격 (1K tokens 기준)

| 모델 | 입력 | 출력 |
|------|------|------|
| gpt-4o-mini | $0.00015 | $0.00060 |
| gpt-3.5-turbo | $0.00050 | $0.00150 |
| gpt-4o | $0.00500 | $0.01500 |
