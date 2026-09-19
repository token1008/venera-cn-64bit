class VeneraDiag extends ComicSource {
  name = "诊断与日志上传"

  key = "venera_diag"

  version = "1.0.0"

  minAppVersion = "1.0.0"

  url = "https://cdn.jsdelivr.net/gh/token1008/venera-cn-64bit@main/sources/venera_diag.js"

  // 日志仓库（公开，任何人可读；写入需要 token，见设置）
  static repo = "token1008/venera-logs"

  static api = "https://api.github.com"

  get deviceId() {
    let id = this.loadData("deviceId")
    if (!id) {
      id = createUuid().replace(/-/g, "").slice(0, 12)
      this.saveData("deviceId", id)
    }
    return id
  }

  get token() {
    return this.loadData("ghToken") || ""
  }

  _headers() {
    let h = {
      "Accept": "application/vnd.github+json",
      "User-Agent": "Venera-Diag/1.0",
      "X-GitHub-Api-Version": "2022-11-28",
    }
    if (this.token) h["Authorization"] = "Bearer " + this.token
    return h
  }

  _stamp() {
    let d = new Date()
    let p = (n) => (n < 10 ? "0" + n : "" + n)
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
      "_" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds())
  }

  // 收集设备与环境信息
  _env() {
    let info = {
      deviceId: this.deviceId,
      time: new Date().toISOString(),
      appVersion: (typeof APP !== "undefined" && APP.version) ? APP.version : "unknown",
      platform: (typeof APP !== "undefined" && APP.platform) ? APP.platform : "unknown",
      locale: (typeof APP !== "undefined" && APP.locale) ? APP.locale : "unknown",
      sourceCount: 0,
      sources: [],
    }
    return info
  }

  // 依次尝试的搜索词：不同站点收录范围不同，单一关键词会产生假失败
  static probeKeywords = ["海贼", "斗破苍穹", "漫画", "one", "love"]

  // 探测单个源：搜索 -> 详情 -> 章节 -> 中间章节图片，记录每一步的错误原文。
  // 多关键词、多候选漫画地尝试，尽量区分"源坏了"和"这个词/这本刚好没有"。
  async _probe(key, src) {
    let r = {
      key: key, name: src.name || key,
      search: null, detail: null, chapters: null, image: null,
      ok: false, triedKeywords: [], triedComics: [],
    }
    let lastErr = ""
    let keywordUsed = null
    let comics = []
    try {
      if (!src.search || typeof src.search.load !== "function") {
        r.search = { ok: false, error: "no search.load" }
        return r
      }
      for (let kw of VeneraDiag.probeKeywords) {
        r.triedKeywords.push(kw)
        try {
          let res = await src.search.load(kw, [], 1)
          let got = (res && res.comics) || []
          if (got.length) { comics = got; keywordUsed = kw; break }
        } catch (e) {
          lastErr = (e && e.message) ? (e.name + ": " + e.message) : String(e)
        }
      }
      r.search = { ok: comics.length > 0, count: comics.length, keyword: keywordUsed }
      if (!comics.length) {
        r.search.error = lastErr || ("所有测试关键词均无结果（试过 " + r.triedKeywords.join("/") + "）")
        return r
      }
      if (!src.comic || typeof src.comic.loadInfo !== "function") {
        r.detail = { ok: false, error: "no comic.loadInfo" }
        return r
      }

      // 最多试 3 本：有些漫画被站点下架/限制，没有章节列表
      let attempts = Math.min(3, comics.length)
      let chosen = null
      for (let i = 0; i < attempts; i++) {
        let c = comics[i]
        r.triedComics.push(c.title)
        try {
          let d = await src.comic.loadInfo(c.id)
          let chs = d.chapters instanceof Map ? Array.from(d.chapters.entries()) : Object.entries(d.chapters || {})
          if (!chosen) {
            chosen = { comic: c, detail: d, chapters: chs }
          }
          if (chs.length > 0) { chosen = { comic: c, detail: d, chapters: chs }; break }
        } catch (e) {
          lastErr = (e && e.message) ? (e.name + ": " + e.message) : String(e)
        }
      }
      if (!chosen) {
        r.detail = { ok: false, error: lastErr || "全部候选漫画详情加载失败" }
        return r
      }
      r.comicTitle = chosen.comic.title
      r.detail = { ok: true, title: chosen.detail.title }
      r.chapters = { ok: chosen.chapters.length > 0, count: chosen.chapters.length }
      if (!chosen.chapters.length) {
        r.chapters.error = "详情页可读，但该漫画没有章节列表（站点侧限制/下架，试过 " + r.triedComics.join("、") + "）"
        return r
      }
      if (!src.comic || typeof src.comic.loadEp !== "function") {
        r.image = { ok: false, error: "no comic.loadEp" }
        return r
      }

      // 图片：中间章节优先（开头常是付费/预告），失败再试第一章
      let n = chosen.chapters.length
      let order = [Math.floor(n / 2), 0, n - 1]
      for (let idx of order) {
        if (idx < 0 || idx >= n) continue
        let ch = chosen.chapters[idx]
        try {
          let ep = await src.comic.loadEp(chosen.comic.id, ch[0])
          let images = (ep && ep.images) || []
          if (images.length) {
            r.image = { ok: true, count: images.length, chapter: ch[1] }
            r.ok = true
            return r
          }
          lastErr = "章节「" + ch[1] + "」返回 0 张图片"
        } catch (e) {
          lastErr = (e && e.message) ? (e.name + ": " + e.message) : String(e)
        }
      }
      r.image = { ok: false, error: lastErr || "全部尝试的章节都没有图片" }
      return r
    } catch (e) {
      let msg = (e && e.message) ? (e.name + ": " + e.message) : String(e)
      if (!r.search) r.search = { ok: false, error: msg }
      else if (!r.detail) r.detail = { ok: false, error: msg }
      else if (!r.chapters) r.chapters = { ok: false, error: msg }
      else if (!r.image) r.image = { ok: false, error: msg }
      r.error = msg
      return r
    }
  }

  // 扫描全部已安装源（App 里所有源共享一个 JS 引擎，可从全局注册表枚举）
  async _scanAll(onProgress) {
    let env = this._env()
    let registry = (typeof ComicSource !== "undefined" && ComicSource.sources) ? ComicSource.sources : {}
    let keys = Object.keys(registry)
    env.sourceCount = keys.length
    let results = []
    for (let i = 0; i < keys.length; i++) {
      let k = keys[i]
      if (k === this.key) continue // 跳过自己
      if (onProgress) onProgress(i + 1, keys.length, k)
      let rec
      try {
        rec = await this._probe(k, registry[k])
      } catch (e) {
        rec = { key: k, name: (registry[k] && registry[k].name) || k, ok: false, error: String(e) }
      }
      results.push(rec)
    }
    env.sources = results
    env.summary = {
      total: results.length,
      ok: results.filter((x) => x.ok).length,
      failed: results.filter((x) => !x.ok).length,
    }
    return env
  }

  _buildReport(env) {
    let L = []
    L.push("# Venera 诊断报告")
    L.push("")
    L.push("- 设备ID: `" + env.deviceId + "`")
    L.push("- 时间: " + env.time)
    L.push("- App版本: " + env.appVersion)
    L.push("- 平台: " + env.platform)
    L.push("- 语言: " + env.locale)
    L.push("- 源总数: " + env.sourceCount)
    L.push("")
    L.push("## 汇总")
    L.push("")
    L.push("| 可用 | 失败 |")
    L.push("|---|---|")
    L.push("| " + env.summary.ok + " | " + env.summary.failed + " |")
    L.push("")
    L.push("## 逐源结果")
    L.push("")
    L.push("| 源 | key | 搜索 | 详情 | 章节 | 图片 | 失败原因 |")
    L.push("|---|---|---|---|---|---|---|")
    for (let s of env.sources) {
      let mark = (x) => (x ? (x.ok ? "✅" + (x.count !== undefined ? "(" + x.count + ")" : "") : "❌") : "-")
      let err = ""
      if (!s.ok) {
        for (let f of ["search", "detail", "chapters", "image"]) {
          if (s[f] && s[f].ok === false && s[f].error) { err = s[f].error; break }
        }
        if (!err && s.error) err = s.error
      }
      L.push("| " + s.name + " | `" + s.key + "` | " + mark(s.search) + " | " + mark(s.detail) +
        " | " + mark(s.chapters) + " | " + mark(s.image) + " | " + String(err).replace(/\|/g, "/").slice(0, 120) + " |")
    }
    L.push("")
    L.push("## 原始数据")
    L.push("")
    L.push("```json")
    L.push(JSON.stringify(env, null, 2))
    L.push("```")
    return L.join("\n")
  }

  // 上传到 GitHub 日志仓库：logs/<日期>/<设备ID>_<时间>.md
  async _upload(env) {
    if (!this.token) throw "未设置 GitHub Token（点上方「设置 Token」）"
    let stamp = this._stamp()
    let day = stamp.slice(0, 10)
    let path = "logs/" + day + "/" + env.deviceId + "_" + stamp + ".md"
    let content = this._buildReport(env)
    let body = {
      message: "diag: " + env.deviceId + " " + env.summary.ok + "/" + env.summary.total + " ok",
      content: Convert.encodeBase64(Convert.encodeUtf8(content)),
      branch: "main",
    }
    let url = VeneraDiag.api + "/repos/" + VeneraDiag.repo + "/contents/" + path
    let res = await Network.put(url, this._headers(), Convert.encodeUtf8(JSON.stringify(body)))
    if (res.status !== 200 && res.status !== 201) {
      throw "上传失败 HTTP " + res.status + "：" + String(res.body).slice(0, 300)
    }
    return { path: path, url: "https://github.com/" + VeneraDiag.repo + "/blob/main/" + path, bytes: content.length }
  }

  settings = {
    runScan: {
      title: "扫描全部源并上传诊断报告",
      type: "callback",
      buttonText: "开始扫描并上传",
      callback: async () => {
        if (!this.token) {
          UI.showMessage("请先设置 GitHub Token")
          return
        }
        let loadId = UI.showLoading(null)
        try {
          let env = await this._scanAll((i, n, k) => {
            // 进度提示：JS 侧无法更新进度条文字，用日志记录
            console.log("scan " + i + "/" + n + " " + k)
          })
          let r = await this._upload(env)
          UI.cancelLoading(loadId)
          UI.showDialog("诊断完成", "已上传：" + r.path + "\n\n可用 " + env.summary.ok + " / " + env.summary.total + " 个源", [
            { text: "关闭", callback: () => {}, style: "text" },
            { text: "打开日志", callback: () => UI.launchUrl(r.url), style: "filled" },
          ])
        } catch (e) {
          UI.cancelLoading(loadId)
          let msg = (e && e.message) ? (e.name + ": " + e.message) : String(e)
          UI.showDialog("诊断失败", msg, [
            { text: "关闭", callback: () => {}, style: "text" },
          ])
        }
      },
    },
    setToken: {
      title: "设置 GitHub Token（上传需要）",
      type: "callback",
      buttonText: "设置 Token",
      callback: async () => {
        let t = UI.showInputDialog("粘贴 GitHub Token（需 repo 权限）", (v) => {
          if (!v || v.length < 20) return "Token 太短"
          return null
        })
        if (t) {
          this.saveData("ghToken", t.trim())
          UI.showMessage("Token 已保存")
        }
      },
    },
    clearToken: {
      title: "清除已保存的 Token",
      type: "callback",
      buttonText: "清除",
      callback: async () => {
        this.deleteData("ghToken")
        UI.showMessage("Token 已清除")
      },
    },
    showDeviceId: {
      title: "本机设备ID",
      type: "callback",
      buttonText: "查看",
      callback: async () => {
        UI.showDialog("设备ID", this.deviceId, [
          { text: "复制", callback: () => { setClipboard(this.deviceId); UI.showMessage("已复制") }, style: "text" },
          { text: "关闭", callback: () => {}, style: "filled" },
        ])
      },
    },
    previewReport: {
      title: "本地预览报告（不上传）",
      type: "callback",
      buttonText: "生成预览",
      callback: async () => {
        let loadId = UI.showLoading(null)
        try {
          let env = await this._scanAll(null)
          let txt = this._buildReport(env)
          this.saveData("lastReport", txt)
          UI.cancelLoading(loadId)
          setClipboard(txt.slice(0, 20000))
          UI.showDialog("预览已生成", "共 " + env.summary.total + " 个源，可用 " + env.summary.ok +
            " 个。报告已复制到剪贴板（前 20000 字）。", [
            { text: "关闭", callback: () => {}, style: "text" },
          ])
        } catch (e) {
          UI.cancelLoading(loadId)
          UI.showDialog("生成失败", String(e), [{ text: "关闭", callback: () => {}, style: "text" }])
        }
      },
    },
  }

  // 诊断源本身不提供漫画内容，但保持接口完整以便被正常解析加载
  search = {
    load: async (keyword, options, page) => {
      return { comics: [], maxPage: page }
    },
  }

  comic = {
    loadInfo: async (id) => {
      throw "诊断源不提供漫画"
    },
    loadEp: async (comicId, epId) => {
      throw "诊断源不提供漫画"
    },
  }
}
