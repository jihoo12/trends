# trends

[English](README.md)

Hacker News, GitHub Trending, arXiv를 매일 스냅샷으로 쌓고, **시간에 따른 변화**를 보여주는 대시보드예요.
[trendmcp](https://github.com/jihoo12/trendmcp)의 소스 모듈을 그대로 써요. trendmcp는 "지금" 뭐가 인기인지 보여주고, 이건 "어제와 뭐가 달라졌는지"를 보여줘요.

**대시보드:** https://jihoo12.github.io/trends/

## 대시보드

- **급상승 레포 TOP 10**: 최근 7일 동안 직접 관측한 ★ 증가량. 기록이 없으면 GitHub 주간 수치를 써요
- **레포 ★ 추이**: 상위 5개 레포를 레포마다 따로 그린 작은 그래프
- **키워드 추이**: HN 제목, GitHub 설명, arXiv 제목에 나온 단어 빈도와 7일 평균 대비 변화
- **새로 등장한 레포 / 빠진 레포**: 이전 스냅샷과 비교
- **오늘의 HN 상위 글**

추이 관련 항목은 스냅샷이 이틀 이상 쌓여야 의미가 생겨요.

## 동작 방식

`.github/workflows/collect.yml`이 매일 09:00 KST(00:00 UTC)에 실행돼요.

1. `npm run collect`로 스냅샷을 `data/YYYY-MM-DD.json`에 저장해요 (날짜는 KST 기준이고, 같은 날 다시 실행하면 그날 파일을 덮어써요)
2. 새 스냅샷을 `main`에 커밋해요
3. `npm run build`로 최근 90일치를 `web/history.js`로 묶고, `web/`을 GitHub Pages에 배포해요

Actions 탭에서 **Run workflow**로 수동 실행할 수도 있어요. `web/`이나 `src/`를 고쳐서 push하면 새 스냅샷 없이 페이지만 다시 배포돼요.
GitHub 스케줄은 몇 분에서 수십 분 늦게 실행될 수 있어요.

## 로컬에서 실행

Node.js 23.6 이상이 필요해요 (`.ts` 파일을 바로 실행해서 빌드 단계가 없어요).

```bash
npm install
npm run build        # data/ → web/history.js
npm run collect      # (선택) 지금 바로 스냅샷 하나 수집
xdg-open web/index.html
```

`web/history.js`는 커밋하지 않으니, `git pull` 후에는 `npm run build`를 다시 실행하세요.
