# 지원서 자동 작성 사용법

## 1. 포트폴리오 설정

### PDF에서 이력서 가져오기

```python
from src.portfolio import PortfolioManager

portfolio = PortfolioManager()
portfolio.import_from_pdf("이력서.pdf")
portfolio.save_to_json()
```

### 직접 포트폴리오 편집

```python
from src.portfolio import PortfolioManager

portfolio = PortfolioManager()
portfolio.update_field("name", "홍길동")
portfolio.update_field("email", "hong@example.com")
portfolio.update_field("phone", "010-1234-5678")
```

## 2. 자기소개서 작성

### 채용 공고 분석

```python
from src.resume_writer import ResumeWriter

writer = ResumeWriter()

job_posting = """
[채용] 백엔드 개발자
- 자격요건: Java 3년 이상, Spring Boot 경험
- 우대사항: AWS 경험
"""

analysis = writer.analyze_job_posting(job_posting)
print(analysis)
```

### 맞춤형 자기소개서 작성

```python
# 자기소개서 작성
self_intro = writer.generate_self_introduction(
    job_posting, 
    question="본인을 소개해주세요"
)
print(self_intro)
```

### 합격률 향상 팁 받기

```python
tips = writer.generate_success_tips(job_posting)
print(f"강점: {tips['strengths']}")
print(f"개선점: {tips['improvement_suggestions']}")
```

## 3. 지원서 자동 작성

### 통합 에이전트 사용

```python
from src.application_agent import ApplicationAgent

agent = ApplicationAgent(headless=False)

# 채용 공고 텍스트
job_posting = """
[채용] 백엔드 개발자 모집
- 담당업무: Java/Spring Boot 기반 백엔드 개발
- 자격요건: 정보처리기사, Java 3년 이상
"""

# 지원서 URL로 이동해서 자동 채우기
agent.auto_fill_application(
    job_url="https://company.com/apply",
    job_posting_text=job_posting
)
```

### 지원서 작성 가이드만 받기

```python
guide = agent.get_application_guide(job_posting)
print(guide)
```

## 4. 전체 워크플로우 예시

```python
from src.portfolio import PortfolioManager
from src.resume_writer import ResumeWriter
from src.application_agent import ApplicationAgent

# 1. 포트폴리오 설정
portfolio = PortfolioManager()
# portfolio.import_from_pdf("이력서.pdf")  # PDF에서 가져오기

# 2. 채용 공고 분석 및 자기소개서 작성
writer = ResumeWriter()
job_posting = "채용 공고 텍스트..."

self_intro = writer.generate_self_introduction(job_posting)
tips = writer.generate_success_tips(job_posting)

print(f"자기소개서:\n{self_intro}")
print(f"합격 팁: {tips}")

# 3. 지원서 자동 작성
agent = ApplicationAgent(headless=False)
agent.auto_fill_application("https://company.com/apply", job_posting)
```

## 5. 비용 절감 팁

- 캐싱 활성화: `use_cache=True` (기본값)
- 저렴한 모델 사용: `model="gpt-4o-mini"` (기본값)
- 규칙 기반 처리: 간단한 작업은 LLM 없이 자동 처리

## 6. 테스트 실행

```bash
# PDF 가져오기 테스트
python test_pdf_import.py

# 자기소개서 작성 테스트
python test_resume_writer.py

# 브라우저 자동화 테스트
python test_agent.py
```
