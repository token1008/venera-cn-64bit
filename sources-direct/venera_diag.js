class VeneraDiag extends ComicSource {
  name = "诊断与日志上传"

  key = "venera_diag"

  version = "2.1.2"

  minAppVersion = "1.0.0"

  url = "https://cdn.jsdelivr.net/gh/token1008/venera-cn-64bit@main/sources-direct/venera_diag.js"

  // 日志仓库（公开可读；写入需要 token，见「使用说明」）
  static repo = "token1008/venera-logs"

  static api = "https://api.github.com"

  // 列表/详情页的占位图标（公开稳定，拉不到时 App 会显示默认占位图）
  static icon = "https://github.githubassets.com/favicons/favicon.png"

  // 依次尝试的搜索词：不同站点收录范围不同，单一关键词会产生假失败
  static probeKeywords = ["海贼", "斗罗大陆", "恋爱", "斗破苍穹", "漫画", "one", "love"]

  // 每个源的探测时间上限（毫秒）。坏源会逐个请求等网络超时，不设上限会拖很久。
  static budgetMs = 40000

  // 同时探测几个源（并发能显著缩短总时长：28 个源串行最坏要十几分钟）
  static concurrency = 3

  // App 的首页卡片是编译进程序的、加不了新按钮，所以把动作做成"条目"：
  // 从主页搜索框或发现页点进来即可操作，不用在 40 多个源里翻找设置。
  static actions = [
    {
      id: "act_upload",
      title: "① 上传诊断报告（扫描全部源→传到 GitHub）",
      desc: "点开即开始，约 2-5 分钟；完成后弹窗提示",
    },
    {
      id: "act_preview",
      title: "② 本地预览报告（不上传，复制到剪贴板）",
      desc: "不想给 Token 时用这个，把结果粘贴发给作者",
    },
    {
      id: "act_last",
      title: "③ 查看上次扫描结果",
      desc: "显示最近一次扫描的逐源可用性",
    },
    {
      id: "act_device",
      title: "④ 查看本机设备ID",
      desc: "多台设备上报时用来区分是哪台机器",
    },
    {
      id: "act_token",
      title: "⑤ 设置 / 清除 GitHub Token",
      desc: "上传前需要设置一次；Token 只存本机",
    },
    {
      id: "act_help",
      title: "⑥ 使用说明",
      desc: "这套工具能做什么、怎么申请 Token",
    },
  ]

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
      "User-Agent": "Venera-Diag/2.0",
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

  _env() {
    return {
      deviceId: this.deviceId,
      time: new Date().toISOString(),
      appVersion: (typeof APP !== "undefined" && APP.version) ? APP.version : "unknown",
      platform: (typeof APP !== "undefined" && APP.platform) ? APP.platform : "unknown",
      locale: (typeof APP !== "undefined" && APP.locale) ? APP.locale : "unknown",
      sourceCount: 0,
      sources: [],
    }
  }

  // 探测单个源：搜索 → 详情 → 章节 → 中间章节图片，记录每一步的错误原文。
  // 多关键词、多候选漫画地尝试，尽量区分"源坏了"和"这个词/这本刚好没有"。
  // 每个源有 BUDGET 秒的时间上限：坏源在移动网络下会逐个请求等超时，
  // 不设上限的话 28 个源能跑十几分钟。
  async _probe(key, src) {
    let r = {
      key: key, name: src.name || key,
      search: null, detail: null, chapters: null, image: null,
      ok: false, triedKeywords: [], triedComics: [],
    }
    const BUDGET = VeneraDiag.budgetMs
    const BUDGET_SEC = Math.round(BUDGET / 1000)
    const startedAt = Date.now()
    const overBudget = () => (Date.now() - startedAt) > BUDGET
    let lastErr = ""
    let keywordUsed = null
    let comics = []
    try {
      if (!src.search || typeof src.search.load !== "function") {
        r.search = { ok: false, error: "no search.load" }
        return r
      }
      for (let kw of VeneraDiag.probeKeywords) {
        if (overBudget()) { r.budgetExceeded = true; break }
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
        // 关键词全无结果有两种可能：该站刚好没有这些书，或搜索真的坏了。
        // 退回用「发现页」取候选，至少把详情→章节→图片链路验证出来，
        // 这样报告能区分"搜索不可验证"和"源整个坏了"。
        let fromExplore = []
        try { fromExplore = await this._candidatesFromExplore(src) } catch (e) { fromExplore = [] }
        if (fromExplore.length) {
          comics = fromExplore
          r.search.fromExplore = true
          r.search.error = "所有测试关键词均无结果（试过 " + r.triedKeywords.join("/") +
            "）——该站可能确实没有这些书；已改用其发现页继续验证后续链路"
        } else {
          r.search.error = lastErr || ("所有测试关键词均无结果（试过 " + r.triedKeywords.join("/") + "）")
          if (r.budgetExceeded) r.search.error = "探测超时（超过 " + BUDGET_SEC + " 秒），已跳过剩余测试：" + r.search.error
          return r
        }
      }
      if (!src.comic || typeof src.comic.loadInfo !== "function") {
        r.detail = { ok: false, error: "no comic.loadInfo" }
        return r
      }

      // 最多试 3 本：有些漫画被站点下架/限制，没有章节列表
      let attempts = Math.min(3, comics.length)
      let chosen = null
      for (let i = 0; i < attempts; i++) {
        if (overBudget()) { r.budgetExceeded = true; break }
        let c = comics[i]
        r.triedComics.push(c.title)
        try {
          let d = await src.comic.loadInfo(c.id)
          let chs = d.chapters instanceof Map ? Array.from(d.chapters.entries()) : Object.entries(d.chapters || {})
          if (!chosen) chosen = { comic: c, detail: d, chapters: chs }
          if (chs.length > 0) { chosen = { comic: c, detail: d, chapters: chs }; break }
        } catch (e) {
          lastErr = (e && e.message) ? (e.name + ": " + e.message) : String(e)
        }
      }
      if (!chosen) {
        r.detail = { ok: false, error: (r.budgetExceeded ? "探测超时（超过 " + BUDGET_SEC + " 秒）：" : "") + (lastErr || "全部候选漫画详情加载失败") }
        return r
      }
      r.comicTitle = chosen.comic.title
      r.detail = { ok: true, title: chosen.detail.title }
      r.chapters = { ok: chosen.chapters.length > 0, count: chosen.chapters.length }
      if (chosen.chapters.length && chosen.chapters[0][1] instanceof Map) {
        r.chapters.note = "该源章节为分组结构(Map)"
      }
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
        if (overBudget()) { r.budgetExceeded = true; break }
        let ch = chosen.chapters[idx]
        let chId = ch[0]
        // 有些源的章节标题本身是 Map（分组章节），转成可读文本
        let chName = ch[1]
        if (chName instanceof Map) {
          let names = Array.from(chName.values())
          chName = names.length ? String(names[0]) : "(分组章节)"
        } else if (typeof chName !== "string") {
          chName = String(chName)
        }
        try {
          let ep = await src.comic.loadEp(chosen.comic.id, chId)
          let images = (ep && ep.images) || []
          if (images.length) {
            r.image = { ok: true, count: images.length, chapter: chName }
            r.ok = true
            return r
          }
          lastErr = "章节「" + chName + "」返回 0 张图片"
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

  // 从源的「发现页」取候选漫画。
  // 搜索对不上号时用它兜底，这样仍能验证详情/章节/图片链路。
  // 兼容三种 explore 类型：multiPageComicList / multiPartPage / mixed。
  async _candidatesFromExplore(src) {
    if (!src.explore || !src.explore.length) return []
    for (let page of src.explore) {
      if (!page || typeof page.load !== "function") continue
      let data
      try {
        data = await page.load(page.type === "mixed" ? 0 : 1)
      } catch (e) {
        continue
      }
      let list = []
      if (Array.isArray(data)) {
        // multiPartPage: [{title, comics}]
        for (let part of data) if (part && part.comics && part.comics.length) { list = part.comics; break }
      } else if (data && data.comics && data.comics.length) {
        list = data.comics
      } else if (data && data.data && data.data.length) {
        // mixed: [Comic[] | {title, comics}]
        for (let item of data.data) {
          if (Array.isArray(item) && item.length) { list = item; break }
          if (item && item.comics && item.comics.length) { list = item.comics; break }
        }
      }
      if (list.length) return list.slice(0, 3)
    }
    return []
  }

  // 扫描全部已安装源（App 里所有源共享一个 JS 引擎，可从全局注册表枚举）。
  // 并发 CONCURRENCY 个一起测：串行时坏源各自等超时，28 个源要十几分钟。
  async _scanAll(onProgress) {
    let env = this._env()
    let registry = (typeof ComicSource !== "undefined" && ComicSource.sources) ? ComicSource.sources : {}
    let keys = Object.keys(registry)
    env.sourceCount = keys.length
    let pending = keys.filter((k) => k !== this.key) // 跳过自己
    let results = new Array(pending.length)
    let done = 0
    let cursor = 0
    const CONCURRENCY = Math.max(1, Math.min(VeneraDiag.concurrency, pending.length || 1))
    const worker = async () => {
      while (true) {
        let my = cursor++
        if (my >= pending.length) return
        let k = pending[my]
        let rec
        try {
          rec = await this._probe(k, registry[k])
        } catch (e) {
          rec = { key: k, name: (registry[k] && registry[k].name) || k, ok: false, error: String(e) }
        }
        results[my] = rec
        done++
        if (onProgress) onProgress(done, pending.length, k)
      }
    }
    let workers = []
    for (let i = 0; i < CONCURRENCY; i++) workers.push(worker())
    await Promise.all(workers)
    results = results.filter((x) => x)
    env.sources = results
    env.summary = {
      total: results.length,
      ok: results.filter((x) => x.ok).length,
      failed: results.filter((x) => !x.ok).length,
      searchUnverified: results.filter((x) => x.ok && x.search && !x.search.ok).length,
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
      let mark = (x) => {
        if (!x) return "-"
        if (x.ok) return "✅" + (x.count !== undefined ? "(" + x.count + ")" : "")
        // 搜索由发现页兜底：搜索本身没验证成功，但源是活的
        if (x.fromExplore) return "⚠️改用发现页"
        return "❌"
      }
      let err = ""
      if (!s.ok) {
        for (let f of ["search", "detail", "chapters", "image"]) {
          if (s[f] && s[f].ok === false && s[f].error) { err = s[f].error; break }
        }
        if (!err && s.error) err = s.error
      }
      L.push("| " + s.name + " | `" + s.key + "` | " + mark(s.search) + " | " + mark(s.detail) +
        " | " + mark(s.chapters) + " | " + mark(s.image) + " | " + String(err).replace(/\|/g, "/").slice(0, 140) + " |")
    }
    L.push("")
    L.push("## 原始数据")
    L.push("")
    L.push("```json")
    L.push(JSON.stringify(env, null, 2))
    L.push("```")
    return L.join("\n")
  }

  // 纯文本摘要（详情页展示用）
  _summaryText(env) {
    let L = []
    L.push("设备ID：" + env.deviceId)
    L.push("App版本：" + env.appVersion + "（" + env.platform + "）")
    L.push("源总数：" + env.sourceCount + "　可用：" + env.summary.ok + "　失败：" + env.summary.failed +
      (env.summary.searchUnverified ? "（其中 " + env.summary.searchUnverified + " 个搜索未验证、但详情/章节/图片可用）" : ""))
    L.push("")
    L.push("— 失败的源 —")
    let any = false
    for (let s of env.sources) {
      if (s.ok) continue
      any = true
      let err = ""
      for (let f of ["search", "detail", "chapters", "image"]) {
        if (s[f] && s[f].ok === false && s[f].error) { err = s[f].error; break }
      }
      if (!err && s.error) err = s.error
      L.push("· " + s.name + "：" + String(err).slice(0, 90))
    }
    if (!any) L.push("（全部可用）")
    return L.join("\n")
  }

  // 上传到 GitHub 日志仓库：logs/<日期>/<设备ID>_<时间>.md
  async _upload(env) {
    if (!this.token) throw "未设置 GitHub Token（用动作⑤设置）"
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
    if (res.status === 401) {
      throw "Token 无效或已过期（HTTP 401）。请用动作⑤重新设置。"
    }
    if (res.status === 403) {
      // 403 有两种截然不同的原因，现场探测一下读权限就能区分，
      // 免得用户在不相关的那一项上白折腾：
      //   能读 -> 仓库已授权，只差 Contents 的写权限
      //   不能读 -> 仓库压根没被授权
      let canRead = false
      try {
        let chk = await Network.get(VeneraDiag.api + "/repos/" + VeneraDiag.repo + "/contents/README.md", this._headers())
        canRead = (chk.status === 200)
      } catch (e) { /* 探测失败就按通用提示走 */ }
      if (canRead) {
        throw [
          "Token 缺少「写」权限（HTTP 403）。",
          "",
          "已探测到：这个 Token 能正常读取 " + VeneraDiag.repo + "，说明仓库授权是对的，",
          "只差最后一步 ——",
          "",
          "【去改这一项】",
          "github.com/settings/tokens?type=beta → 点开这个 Token →",
          "Permissions → Repository permissions → 找到 Contents →",
          "把 Read-only 改成 Read and write → 拉到底点 Save。",
          "",
          "Fine-grained Token 改权限不会改变 Token 本身，改完回这里重试即可（不必重新生成）。",
          "",
          "嫌麻烦也可以改用 Classic Token：github.com/settings/tokens 新建，只勾 public_repo。",
        ].join("\n")
      }
      throw [
        "Token 无法访问日志仓库（HTTP 403）。",
        "",
        "这个 Token 连读 " + VeneraDiag.repo + " 都不行，说明仓库没被授权给它。",
        "",
        "【去改这一项】",
        "github.com/settings/tokens?type=beta → 点开这个 Token →",
        "Repository access 选「Only select repositories」→ 勾上 " + VeneraDiag.repo + " →",
        "再到 Permissions → Repository permissions → Contents 设为 Read and write → Save。",
        "",
        "注意：Repository access 若选「Public Repositories」，对公开仓库只有只读权限，会一直 403。",
        "",
        "嫌麻烦也可以改用 Classic Token：github.com/settings/tokens 新建，只勾 public_repo。",
      ].join("\n")
    }
    if (res.status === 404) {
      throw "仓库或分支不存在（HTTP 404）。请确认 Token 已被授权访问 " + VeneraDiag.repo + "。"
    }
    if (res.status !== 200 && res.status !== 201) {
      throw "上传失败 HTTP " + res.status + "：" + String(res.body).slice(0, 300)
    }
    return { path: path, url: "https://github.com/" + VeneraDiag.repo + "/blob/main/" + path, bytes: content.length }
  }

  // 后台跑扫描并上传（不阻塞界面），完成后弹窗
  async _uploadInBackground() {
    let loadId = UI.showLoading(null)
    try {
      let env = await this._scanAll(null)
      this.saveData("lastReport", this._buildReport(env))
      this.saveData("lastSummary", this._summaryText(env))
      let r = await this._upload(env)
      UI.cancelLoading(loadId)
      UI.showDialog("诊断完成", "已上传：" + r.path + "\n\n可用 " + env.summary.ok + " / " + env.summary.total + " 个源", [
        { text: "关闭", callback: () => {}, style: "text" },
        { text: "打开日志", callback: () => UI.launchUrl(r.url), style: "filled" },
      ])
    } catch (e) {
      UI.cancelLoading(loadId)
      let msg = (e && e.message) ? (e.name + ": " + e.message) : String(e)
      UI.showDialog("诊断失败", msg, [{ text: "关闭", callback: () => {}, style: "text" }])
    }
  }

  // 后台跑扫描并复制到剪贴板（不上传）
  async _previewInBackground() {
    let loadId = UI.showLoading(null)
    try {
      let env = await this._scanAll(null)
      let txt = this._buildReport(env)
      this.saveData("lastReport", txt)
      this.saveData("lastSummary", this._summaryText(env))
      UI.cancelLoading(loadId)
      setClipboard(txt.slice(0, 20000))
      UI.showDialog("预览已生成", "共 " + env.summary.total + " 个源，可用 " + env.summary.ok +
        " 个。报告已复制到剪贴板（前 20000 字），可直接粘贴发送。", [
        { text: "关闭", callback: () => {}, style: "text" },
      ])
    } catch (e) {
      UI.cancelLoading(loadId)
      UI.showDialog("生成失败", String(e), [{ text: "关闭", callback: () => {}, style: "text" }])
    }
  }

  // 动作做成"条目"，从主页搜索或发现页都能点进来
  _actionComics() {
    // Comic 的 cover / description 在 App 侧是非空 String，漏传会报
    // "type 'Null' is not a subtype of type 'String'"
    return VeneraDiag.actions.map((a) => new Comic({
      id: a.id,
      title: a.title,
      subtitle: a.desc,
      // 列表会同时渲染 subtitle 与 description，这里留空避免重复
      cover: VeneraDiag.icon,
      description: "",
      tags: ["工具"],
    }))
  }

  explore = [
    {
      title: "诊断与日志上传",
      type: "multiPageComicList",
      load: async (page) => ({ comics: this._actionComics(), maxPage: 1 }),
    },
  ]

  // 搜索任意关键词都返回动作列表（主页搜索框是最短路径）
  search = {
    load: async (keyword, options, page) => ({ comics: this._actionComics(), maxPage: 1 }),
  }

  comic = {
    loadInfo: async (id) => {
      if (id === "act_upload") {
        if (!this.token) {
          return new ComicDetails({
            cover: VeneraDiag.icon,
            title: "① 上传诊断报告",
            description: "还没有设置 GitHub Token，无法上传。\n\n" +
              "请先用「⑤ 设置 / 清除 GitHub Token」填一个 Token，" +
              "或改用「② 本地预览报告」把结果复制给作者。",
            tags: { "状态": ["缺少 Token"] },
            chapters: new Map(),
          })
        }
        // 后台执行并立刻返回，避免详情页转圈几分钟
        this._uploadInBackground()
        return new ComicDetails({
          cover: VeneraDiag.icon,
          title: "① 上传诊断报告",
          description: "已开始扫描本机全部漫画源（搜索→详情→章节→图片），并上传到 GitHub。\n\n" +
            "预计 2-5 分钟，完成后会弹窗提示，可在弹窗点「打开日志」查看。\n\n" +
            "可以关掉这个页面，扫描会在后台继续。",
          tags: { "状态": ["进行中"], "设备ID": [this.deviceId] },
          chapters: new Map(),
        })
      }

      if (id === "act_preview") {
        this._previewInBackground()
        return new ComicDetails({
          cover: VeneraDiag.icon,
          title: "② 本地预览报告",
          description: "已开始扫描本机全部漫画源，完成后把报告复制到剪贴板（不上传任何数据）。\n\n" +
            "预计 2-5 分钟，完成后弹窗提示，届时直接粘贴发送即可。",
          tags: { "状态": ["进行中"], "设备ID": [this.deviceId] },
          chapters: new Map(),
        })
      }

      if (id === "act_last") {
        let s = this.loadData("lastSummary")
        return new ComicDetails({
          cover: VeneraDiag.icon,
          title: "③ 上次扫描结果",
          description: s ? String(s) : "还没有扫描记录。先用动作①或②跑一次。",
          tags: { "设备ID": [this.deviceId] },
          chapters: new Map(),
        })
      }

      if (id === "act_device") {
        return new ComicDetails({
          cover: VeneraDiag.icon,
          title: "④ 本机设备ID",
          description: "你的设备ID：\n\n" + this.deviceId + "\n\n" +
            "本机首次使用时自动生成的随机标识，用于在多台设备上报的日志里区分是哪一台。" +
            "不含任何个人信息，卸载后即失效。",
          tags: { "设备ID": [this.deviceId] },
          chapters: new Map(),
        })
      }

      if (id === "act_token") {
        let has = this.token ? "已设置" : "未设置"
        // ⚠️ UI.showInputDialog 返回的是 Promise（App 侧是 Future），漏 await 会拿到
        // 一个 Promise 对象，存进去的就是 "[object Promise]"——这正是此前
        // 「设置完仍提示未设置」的根因。
        let t = await UI.showInputDialog("粘贴 GitHub Token（输入 clear 可清除）", (v) => null)
        if (t === null || t === undefined) {
          return new ComicDetails({
            cover: VeneraDiag.icon,
            title: "⑤ 设置 / 清除 Token",
            description: "当前状态：" + has + "\n\n（已取消操作）",
            tags: { "状态": [has] },
            chapters: new Map(),
          })
        }
        t = String(t).trim()
        let msg
        if (t === "clear") {
          this.deleteData("ghToken")
          msg = "Token 已清除。"
        } else if (t.length >= 20) {
          this.saveData("ghToken", t)
          // 回读一次确认真的落盘（不只提示成功）
          let saved = String(this.loadData("ghToken") || "")
          msg = saved === t
            ? "Token 已保存（只存在本机）。现在可以用动作①上传了。\n\n已保存：" +
              t.slice(0, 10) + "…（共 " + t.length + " 字符）"
            : "保存失败：写入后回读不一致，请重试。"
        } else if (t === "") {
          msg = "未输入内容，Token 保持：" + has
        } else {
          msg = "Token 太短（" + t.length + " 字符，GitHub Token 至少 20 字符），未保存。"
        }
        return new ComicDetails({
          cover: VeneraDiag.icon,
          title: "⑤ 设置 / 清除 Token",
          description: msg,
          tags: { "状态": [this.token ? "已设置" : "未设置"] },
          chapters: new Map(),
        })
      }

      // act_help 及未知 id
      return new ComicDetails({
        cover: "",
        title: "⑥ 使用说明",
        description: [
          "【这套工具做什么】",
          "把本机漫画源的运行故障上报给作者，用于修补失效的源。会上报：哪个源、在哪一步（搜索/详情/章节/图片）失败、站点的原始报错文本。",
          "",
          "【怎么用】",
          "· 首次：用动作⑤设置一个 GitHub Token（只需一次）",
          "· 平时：动作①上传，或动作②只复制不上传",
          "· 随时：动作③回看上次结果",
          "",
          "【Token 怎么申请（关键，配错会上传失败）】",
          "方式一 · Fine-grained Token（推荐，权限最小）：",
          "1. 打开 github.com/settings/tokens?type=beta 新建",
          "2. Repository access 必须选「Only select repositories」，只勾 venera-logs",
          "   ⚠️ 不要选「Public Repositories」——那对公开仓库只有只读权限，必然 403",
          "3. Permissions → Repository permissions → Contents 设为 Read and write",
          "4. 生成后复制（github_pat_ 开头）",
          "",
          "方式二 · Classic Token（最省事）：",
          "1. 打开 github.com/settings/tokens 新建 Classic token",
          "2. 只勾 public_repo 这一个 scope 即可（够用，且比勾整个 repo 安全）",
          "",
          "改过权限后，必须把新 Token 重新填一次（动作⑤）。",
          "",
          "【隐私】",
          "Token 只保存在本机该源的私有数据里，不会上传到别处；报告不含账号密码、Cookie、Token，只有公开接口的探测结果。",
        ].join("\n"),
        tags: { "设备ID": [this.deviceId], "Token": [this.token ? "已设置" : "未设置"] },
        chapters: new Map(),
      })
    },
    loadEp: async (comicId, epId) => {
      throw "这是工具条目，不是漫画章节"
    },
  }

  // 源设置里也保留入口（给习惯从源设置操作的用户）
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
        await this._uploadInBackground()
      },
    },
    setToken: {
      title: "设置 GitHub Token（上传需要）",
      type: "callback",
      buttonText: "设置 Token",
      callback: async () => {
        // 同样必须 await：否则拿到的是 Promise 对象，既存不进也会报 "trim is not a function"
        let t = await UI.showInputDialog("粘贴 GitHub Token（需 repo 权限）", (v) => {
          if (!v || v.length < 20) return "Token 太短"
          return null
        })
        if (t) {
          t = String(t).trim()
          this.saveData("ghToken", t)
          let saved = String(this.loadData("ghToken") || "")
          UI.showMessage(saved === t ? "Token 已保存" : "保存失败，请重试")
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
        await this._previewInBackground()
      },
    },
  }
}
