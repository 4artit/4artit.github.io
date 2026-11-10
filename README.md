# 4artit.github.io

개인 프로젝트 & 커리어 블로그. GitHub Pages 기본 Jekyll로 빌드됩니다 (별도 Actions 불필요).

## 글 쓰기

1. `_drafts/post-template.md`를 복사해서 `_posts/YYYY-MM-DD-제목.md`로 저장
2. front matter의 `categories`를 `projects` 또는 `career`로 지정
3. push하면 1~2분 뒤 반영

### 유튜브 영상 넣기

```liquid
{% include youtube.html id="VIDEO_ID" %}
{% include youtube.html id="VIDEO_ID" caption="캡션" start=30 %}
{% include youtube.html id="VIDEO_ID" vertical=true %}   <!-- 쇼츠 -->
```

또는 front matter에 `video: VIDEO_ID`를 넣으면 글 상단에 대표 영상으로 들어갑니다.

### 이미지

`assets/img/`에 넣고 `![설명](/assets/img/파일.png)`.

## 로컬 미리보기 (선택)

```sh
bundle install
bundle exec jekyll serve --drafts
```
