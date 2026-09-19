# Venera 中文源索引（venera-cn-64bit）

Venera 漫画阅读器的**源列表（Repo URL）**仓库。把下面这个地址填进 Venera 的
`设置 → 漫画源 → Repo URL`，即可看到全部可用源并逐个 `Add`：

```
https://cdn.jsdelivr.net/gh/token1008/venera-cn-64bit@main/index.json
```

备用地址（jsDelivr 不可达时使用）：

```
https://raw.githubusercontent.com/token1008/venera-cn-64bit/main/index.json
```

## 这个仓库是什么

- `index.json` —— 源列表索引，共 **46 个源**：
  - **13 个中文源**（本仓库 `sources/*.js`，由本项目编写并逐源实测）；
  - **33 个官方源**（直接引用官方 `venera-app/venera-configs` 的 jsDelivr 地址，本仓库不重复托管）。
- `sources/*.js` —— 本仓库自写的中文源脚本（Venera 1.6.3 / 纯 64 位 Android 实测通过）。

## 已收录的中文源（12 个实测可用）

| 源 | key | 状态 | 说明 |
|---|---|---|---|
| 极速漫画 | `jisu_1kkk` | ✅ 全链路通过 | 搜索/26分类/章节；**图片 CDN 强制校验 Referer，靠 `onImageLoad` 注入请求头解决黑屏**；支持网页登录（站点登录带旋转验证码） |
| 看漫画 | `kanman` | ✅ | 小明太极平台 JSON 接口，章节完整 |
| 知音漫客 | `zymk` | ✅ | 小明太极平台 JSON 接口，章节完整 |
| 动漫啦 | `dongmanla` | ✅ | 35 个分类，滚动模式章节 |
| 国漫吧 | `guoman8` | ✅ | **含「按年份」筛选 2014–2019**（已验证分页） |
| 178漫画网 | `manhua178` | ✅ | 24 个分类，webp 图源 |
| 漫客栈 | `mkzhan` | ✅ | 章节接口无需登录；**支持账号密码登录**（`account.login`） |
| 漫漫漫画 | `manman` | ✅ | 付费章节会明确报错，不返回假图 |
| 腾讯漫画 | `acqq` | ⚠️ 部分 | 24 分类 + 排行榜；**仅免费/试读章节可读** |
| 大魔兔 | `damotu` | ⚠️ 部分 | 本地索引搜索（4 万+ 本）；老漫画图片节点已失效，新节点正常 |
| 漫画吧网 | `manhuaba` | ✅ | 章节图片列表为 AES 加密，源内解密 |
| Cosplay啦 | `ciyuandao` | ✅ | 图集站，相册 = 单章 |
| 奇漫屋 | `qimanwu` | ❌ | 站点已变成 SEO 文章站，不再提供漫画（源保留，站点恢复即可用） |

## 用法

1. 安装本项目交付的 APK（默认已指向本仓库，无需手动填地址）。
2. 打开 `漫画源` 页面 → 点 `Refresh` → 在需要的源右边点 `Add`。
3. 想恢复官方列表：把 Repo URL 改回
   `https://cdn.jsdelivr.net/gh/venera-app/venera-configs@main/index.json`。

## 说明

- 本仓库只包含**解析规则脚本**，不含任何漫画内容；所有内容均来自各站点公开页面。
- 源脚本按 Venera 官方 `ComicSource` 规范编写，最低 App 版本 1.0.0（在 1.6.3 实测）。
- 站点改版会导致规则失效，欢迎提 Issue/PR。
