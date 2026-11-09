# FacultyPerformance Pages

GitHub Pages 주소를 열면 조회용 대시보드가 바로 표시됩니다. 국내 기관, 한국인 연구자, 학교 비교, 교수·후보자 검색과 근거, 교수 비교, 데이터 현황을 볼 수 있습니다. 기간·분야·학회 필터와 검색은 브라우저에서 실행됩니다. 데이터는 내보낸 시점 기준이며 차트 표현과 일부 선택 조작은 Streamlit 화면과 다릅니다.

## 원본 Mac에서 갱신

FacultyPerformance 폴더에 `data/public.duckdb`, `data/pii.duckdb`, `src/fp/`와 원본 Python 환경이 필요합니다. 원본 앱이나 데이터 갱신 작업을 닫은 뒤 `export_pages_snapshot.py`를 내려받아 FacultyPerformance 폴더에서 실행합니다.

```sh
.venv/bin/python ~/Downloads/export_pages_snapshot.py
```

스크립트는 원본 Mac의 기존 Keychain 키를 사용합니다. 서버에서 `~/.config/faculty-performance/pii.key`에 보관하는 경우 파일 권한을 `600`으로 설정합니다. 기존 키를 화면에 표시하지 않고 입력하려면 `--ask-db-key`를 붙입니다. 이미 내보낸 폴더가 있으면 `--output-dir faculty-pages-export-new`처럼 새 폴더를 지정합니다.

`faculty-pages-export/faculty-performance.json.gz`를 배포 담당자에게 보냅니다. 배포 담당자가 저장소 루트의 동명 파일을 교체하면 같은 주소에서 새 스냅샷이 열립니다. gzip은 압축 형식이며, GitHub에 올린 스냅샷은 누구나 내려받을 수 있습니다.

브라우저 스크립트를 수정해 배포할 때는 `index.html`, `viewer.js`, `views.js`의 스크립트 URL에 붙은 `v` 값을 모두 새 값으로 바꿉니다. 이전에 방문한 브라우저에서도 새 모듈을 받도록 하기 위한 설정입니다.
