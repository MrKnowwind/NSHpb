# NSHpb · 逆水寒十二人排表

19排表妙妙小工具

左边是候选名单，右边是一队和二队，每队 6 人。登记时填写玩家名和主职业，可多选副职业。卡片按主职业着色，点击卡片可以编辑资料或选择移动位置。

把卡片拖到有空位的队伍时，可以插到现有玩家前面，原有卡片顺延。队伍自动靠顶。拖到满队的玩家卡片上会交换位置。触屏上可以用卡片右侧的拖动手柄。

名单和排表自动保存在当前浏览器。首次打开时，候选区和两支队伍都是空白的。

「导出配置」可生成一行 12 位短码，也可复制完整配置码。点击「生成短码」会将当前排表上传到 Cloudflare，收到短码的人可在 30 天内导入。粘贴短码时默认恢复完整排表，也可手动选择「仅加入玩家」。导入也接受旧版配置码。仅加入玩家时，重复导入同一份配置会跳过已存在的玩家。

## 本地运行

在项目目录执行下面的命令，然后打开 [本地预览](http://localhost:8000/)。

```sh
python -m http.server 8000 --directory site
```

使用 Node.js 24 运行测试。

```sh
node --test
```

## GitHub Pages 部署

1. 在 GitHub 创建空仓库。将本项目文件推送到仓库的 `main` 分支。
2. 在仓库的 **Settings → Pages → Build and deployment** 中将 **Source** 设为 **GitHub Actions**。
3. 如果第一次推送时还没启用 Pages，在 **Actions → Deploy roster to GitHub Pages** 中选择 **Run workflow**。后续推送到 `main` 会自动测试并部署。

部署完成后，在工作流的 `github-pages` 环境中可找到站点地址。部署只发布 `site/` 下的网页文件。

## 短码服务部署

短码接口由 Cloudflare Worker 和 D1 提供。使用有该账户权限的 Wrangler 登录，在项目目录应用数据库迁移后部署 Worker。

```sh
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy
```

Worker 的入口地址由 `site/index.html` 中的 `share-api` 配置。若更换站点域名，更新 `wrangler.toml` 中的 `SITE_ORIGIN`。
