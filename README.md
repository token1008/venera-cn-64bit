# Venera 中文源索引（venera-cn-64bit）

Venera 漫画阅读器的**源列表（Repo URL）**仓库。把这个地址填进
`设置 → 漫画源 → Repo URL`，即可看到全部源并逐个 `Add`：

```
https://cdn.jsdelivr.net/gh/token1008/venera-cn-64bit@main/index.json
```

备用（jsDelivr 不可达时）：
```
https://raw.githubusercontent.com/token1008/venera-cn-64bit/main/index.json
```

## 源分两类，按需添加

App 的源列表是**平铺**的（只显示名称/版本/说明），所以用名称前缀区分：

| 前缀 | 数量 | 含义 | 放哪 |
|---|---|---|---|
| **【直连】** | 28 | **国内网络直连即可用**，不需要代理 | `sources-direct/` |
| **【需代理】** | 12 | 需要代理/VPN 才能加载（直连会连接重置或超时） | `sources-proxy/` |
| **【工具】** | 1 | 诊断与日志上传（非漫画源） | `sources-direct/` |

> 这个分类不是猜的：对每个源**实际跑了一遍搜索**，直连成功→【直连】；
> 直连失败但走代理成功→【需代理】；两边都不通的不收录。

## 目录结构

```
index.json              源列表（App 读取这个文件）
sources-direct/*.js     直连源（28 个）
sources-proxy/*.js      需代理源（12 个）
```

## 已收录的直连源

| 源 | key | 说明 |
|---|---|---|
| 极速漫画 | `jisu_1kkk` | 搜索/26分类/章节；图片CDN需Referer，已由 `onImageLoad` 解决黑屏；支持网页登录 |
| 看漫画 | `kanman` | 小明太极平台 JSON 接口 |
| 知音漫客 | `zymk` | 小明太极平台 JSON 接口 |
| 动漫啦 | `dongmanla` | 35 个分类 |
| 国漫吧 | `guoman8` | **含「按年份」筛选 2014–2019** |
| 178漫画网 | `manhua178` | 24 个分类，webp 图源 |
| 漫客栈 | `mkzhan` | 章节接口无需登录；支持账号密码登录 |
| 漫漫漫画 | `manman` | 付费章节会明确报错 |
| 腾讯漫画 | `acqq` | 24 分类+排行榜；仅免费章节可读 |
| 大魔兔 | `damotu` | 本地索引搜索（4 万+ 本） |
| 漫画吧网 | `manhuaba` | AES 解密图片列表 |
| Cosplay啦 | `ciyuandao` | 图集站，相册=单章 |
| 奇漫屋 | `qimanwu` | 站点已停更漫画，保留待恢复 |
| 拷贝漫画 / comick / MangaDex / 爱看漫 / 再漫画 / GoDa / hitomi 等 | — | 官方源，实测直连搜索可用 |

## 诊断与日志上传（【工具】诊断与日志上传）

不是漫画源，用来**把运行故障上报给作者**：

1. 添加该源 → 打开它的**设置** → **设置 GitHub Token**（需 `repo` 权限的 PAT）；
2. 点 **扫描全部源并上传诊断报告**；
3. 它会逐个测试你已安装的所有源（搜索→详情→章节→图片），把**哪台设备、哪个源、在哪一步、报什么错**
   写成报告，按日期上传到 [venera-logs](https://github.com/token1008/venera-logs) 的 `logs/YYYY-MM-DD/` 下。

Token 只存在本机该源的私有数据里，不会上传到别处。不想给 Token 也可以用
**本地预览报告**（生成后复制到剪贴板，自己贴给我）。

## 说明

- 本仓库只包含**解析规则脚本**，不含任何漫画内容；内容均来自各站点公开页面。
- 源按 Venera 官方 `ComicSource` 规范编写，最低 App 版本 1.0.0（1.6.3 实测）。
- 站点改版会导致规则失效，欢迎提 Issue/PR。
