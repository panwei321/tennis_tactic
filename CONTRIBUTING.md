# 贡献指南

欢迎贡献战术脚本、修复动画细节或完善介绍文案！

## 贡献方式

1. Fork 本仓库并创建你的分支；
2. 按下面的规范添加/修改 `tactics/` 下的脚本；
3. 运行 `node tools/build-index.js`，确保**校验通过**且索引已重建；
4. 本地预览确认动画效果：`python3 -m http.server 8080` → 打开 `http://localhost:8080/viewer/`；
5. 提交 Pull Request，说明战术思路和适用场景。

## 战术脚本规范

- **一个文件一个战术**，放在 `tactics/<分类目录>/` 下（singles / doubles / serving / returning / volley / baseline，新分类请先开 issue 讨论）；
- 文件名与 `id` 一致，使用 kebab-case 英文（如 `serve-and-volley.json`）；
- `script` 部分严格遵守 [ASDL 规范](docs/asdl-spec.md)，重点检查：
  - `meta.duration` 大于最后一个动作的结束时间 200–500ms；
  - `trajectory.waypoints` 至少 3 个点：起点、过网点（y ≈ 640）、落点；
  - 落点不要出界（对照球场坐标系与发球区/底线范围）；
  - 球员 `move` 与击球节奏配合，一拍间隔建议 0.8–1.2 秒；
- 介绍文案四要素（简介/目的/适用场景/注意事项）都填写，用词面向业余爱好者；
- `meta.author` 填你的署名。

## 战术内容要求

- 只贡献**通用战术知识**，不要提交含个人隐私、商业内容或从他人处搬运的文案；
- 战术描述存在多种流派时，在注意事项中说明适用前提，避免绝对化表述。

## 反馈

发现动画错误、坐标出界、文案有争议，欢迎直接开 issue，附上战术名称与截图。
