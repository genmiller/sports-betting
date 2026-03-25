# ⚾⚽ スポーツベット 2026

## 🚀 デプロイ手順（5分）

### ステップ 1 — GitHubにアップロード
```bash
git init
git add .
git commit -m "初回リリース"
git remote add origin https://github.com/YOUR_NAME/sports-betting.git
git branch -M main
git push -u origin main
```

### ステップ 2 — Vercelに無料デプロイ
1. vercel.com にGitHubアカウントでサインイン
2. "Add New Project" → リポジトリを選択
3. そのまま "Deploy" → 数分後にURLが発行される

## 📡 データ取得
| タブ | ソース | 方式 |
|------|--------|------|
| ⚾ NPB/MLB | ESPN非公式API | /api/scores |
| ⚽ J1・W杯 | ESPN非公式API | /api/scores |
| 🏫 高校野球 | SpoNaviスクレイピング | /api/highschool |

## 📁 構成
```
├── index.html       # アプリ本体
├── vercel.json      # Vercel設定
├── api/
│   ├── scores.js    # ESPN経由スコア
│   └── highschool.js # 高校野球スクレイピング
```

## 🔑 現在のパスワード
- メンバー: Pass
- アドミン: admin123
