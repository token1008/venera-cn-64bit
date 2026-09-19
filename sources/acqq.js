class TencentManHua extends ComicSource {
  name = "腾讯漫画"

  key = "acqq"

  version = "1.0.0"

  minAppVersion = "1.0.0"

  url = "https://cdn.jsdelivr.net/gh/token1008/venera-cn-64bit@main/sources/acqq.js"

  static baseUrl = "https://m.ac.qq.com"

  static pcUrl = "https://ac.qq.com"

  static ua = "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

  static uaPc = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

  get headers() {
    return {
      "User-Agent": TencentManHua.ua,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "Referer": TencentManHua.baseUrl + "/",
    }
  }

  // 移动端分类：type 值来自站点 /category/index（rm=日漫 / hm=韩漫 即地区，na/xh/...为题材）
  static categories = [
    ["全部", "all", "upt"],
    ["条漫", "tm", "upt"],
    ["独家", "dj", "upt"],
    ["完结", "wj", "upt"],
    ["日漫", "rm", "upt"],
    ["韩漫", "hm", "pgv"],
    ["恋爱", "na", "pgv"],
    ["玄幻", "xh", "pgv"],
    ["热血", "rx", "pgv"],
    ["悬疑", "xy", "pgv"],
    ["少女", "sv", "pgv"],
    ["科幻", "kh", "pgv"],
    ["逗比", "db", "pgv"],
    ["校园", "qcxy", "pgv"],
    ["都市", "ds", "pgv"],
    ["治愈", "zy", "pgv"],
    ["恐怖", "kb", "pgv"],
    ["妖怪", "yg", "pgv"],
  ]

  // 排行榜：站点 /rank/index?type=
  static ranks = [
    ["飙升榜", "rise"],
    ["畅销榜", "pay"],
    ["新作榜", "new"],
    ["真香榜", "hot"],
  ]

  _parseList(html) {
    let doc = new HtmlDocument(html)
    let comics = []
    let seen = {}
    // 排行榜片段的 top3 用的是 div.top3-box-item，普通列表是 li.comic-item，统一从 a.comic-link 解析
    for (let a of doc.querySelectorAll("a.comic-link")) {
      let href = a.attributes["href"] || ""
      let m = href.match(/\/comic\/index\/id\/(\d+)/)
      if (!m) continue
      let id = m[1]
      if (seen[id]) continue
      let titleEl = a.querySelector(".comic-title")
      if (!titleEl) continue
      let title = titleEl.text.replace(/\s+/g, " ").trim()
      if (!title) continue
      seen[id] = 1
      let coverEl = a.querySelector(".cover-image") || a.querySelector("img")
      let updateEl = a.querySelector(".comic-update")
      let tagEl = a.querySelector(".comic-tag")
      let descEl = a.querySelector(".comic-desc")
      let tags = tagEl ? tagEl.text.trim().split(/\s+/) : []
      comics.push(
        new Comic({
          id: id,
          title: title,
          cover: coverEl ? coverEl.attributes["src"] : null,
          subtitle: updateEl ? updateEl.text.trim() : null,
          description: descEl ? descEl.text.replace(/\s+/g, " ").trim() : null,
          tags: tags,
        })
      )
    }
    doc.dispose()
    return comics
  }

  // PC 版列表（仅用于“连载中 / 免费作品”这类移动端没有的筛选）
  _parsePcList(html) {
    let doc = new HtmlDocument(html)
    let comics = []
    let seen = {}
    for (let li of doc.querySelectorAll("li.ret-search-item")) {
      let a = li.querySelector(".ret-works-title")
      if (!a) continue
      let link = a.querySelector("a") || a
      let href = link.attributes["href"] || ""
      let m = href.match(/\/id\/(\d+)/)
      if (!m) continue
      let id = m[1]
      if (seen[id]) continue
      let title = (link.attributes["title"] || link.text).replace(/\s+/g, " ").trim()
      if (!title) continue
      seen[id] = 1
      let coverEl = li.querySelector("img")
      let cover = null
      if (coverEl) cover = coverEl.attributes["data-original"] || coverEl.attributes["src"] || null
      let upEl = li.querySelector(".mod-cover-list-text")
      let descEl = li.querySelector(".ret-works-decs")
      comics.push(
        new Comic({
          id: id,
          title: title,
          cover: cover,
          subtitle: upEl ? upEl.text.replace(/\s+/g, " ").trim() : null,
          description: descEl ? descEl.text.replace(/\s+/g, " ").trim() : null,
          tags: [],
        })
      )
    }
    doc.dispose()
    return comics
  }

  static _maxPcPage(html) {
    let nums = String(html).match(/title="第(\d+)页"/g)
    let max = 0
    if (nums) {
      for (let s of nums) {
        let m = s.match(/(\d+)/)
        if (m) {
          let v = parseInt(m[1], 10)
          if (v > max) max = v
        }
      }
    }
    return max
  }

  explore = [
    ...TencentManHua.categories.map(([title, type, rank]) => ({
      title: title,
      type: "multiPageComicList",
      load: async (page) => {
        let url = `${TencentManHua.baseUrl}/category/listAll/type/${type}/rank/${rank}?page=${page}&pageSize=30&style=items`
        let res = await Network.get(url, this.headers)
        if (res.status !== 200) throw `Invalid status code: ${res.status}`
        let comics = this._parseList(res.body)
        return { comics: comics, maxPage: comics.length > 0 ? page + 1 : page }
      },
    })),
    ...TencentManHua.ranks.map(([title, type]) => ({
      title: title,
      type: "multiPageComicList",
      load: async (page) => {
        let url = `${TencentManHua.baseUrl}/rank/index?type=${type}&page=${page}&pageSize=30&style=items`
        let res = await Network.get(url, this.headers)
        if (res.status !== 200) throw `Invalid status code: ${res.status}`
        let comics = this._parseList(res.body)
        return { comics: comics, maxPage: comics.length > 0 ? page + 1 : page }
      },
    })),
    {
      title: "连载中",
      type: "multiPageComicList",
      load: async (page) => {
        let url = `${TencentManHua.pcUrl}/Comic/all/finish/1/page/${page}`
        let res = await Network.get(url, {
          "User-Agent": TencentManHua.uaPc,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9",
        })
        if (res.status !== 200) throw `Invalid status code: ${res.status}`
        let comics = this._parsePcList(res.body)
        let maxPage = TencentManHua._maxPcPage(res.body)
        return { comics: comics, maxPage: maxPage > 0 ? maxPage : page }
      },
    },
    {
      title: "免费作品",
      type: "multiPageComicList",
      load: async (page) => {
        let url = `${TencentManHua.pcUrl}/Comic/all/vip/1/page/${page}`
        let res = await Network.get(url, {
          "User-Agent": TencentManHua.uaPc,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9",
        })
        if (res.status !== 200) throw `Invalid status code: ${res.status}`
        let comics = this._parsePcList(res.body)
        let maxPage = TencentManHua._maxPcPage(res.body)
        return { comics: comics, maxPage: maxPage > 0 ? maxPage : page }
      },
    },
  ]

  search = {
    load: async (keyword, options, page) => {
      let url = `${TencentManHua.baseUrl}/search/result?word=${encodeURIComponent(keyword)}&page=${page}&pageSize=30&style=items`
      let res = await Network.get(url, {
        ...this.headers,
        "Referer": `${TencentManHua.baseUrl}/search/index`,
      })
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let comics = this._parseList(res.body)
      return { comics: comics, maxPage: comics.length > 0 ? page + 1 : page }
    },
  }

  comic = {
    loadInfo: async (id) => {
      let url = `${TencentManHua.baseUrl}/comic/index/id/${id}`
      let res = await Network.get(url, this.headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let doc = new HtmlDocument(res.body)

      let title = null
      let metaTitle = doc.querySelector("meta[property='og:title']")
      if (metaTitle) title = (metaTitle.attributes["content"] || "").trim()
      if (!title) {
        let h1 = doc.querySelector(".head-title-tags h1")
        if (h1) title = h1.text.trim()
      }
      if (!title) {
        doc.dispose()
        throw "Comic not found"
      }

      let cover = null
      let metaImg = doc.querySelector("meta[property='og:image']")
      if (metaImg) cover = metaImg.attributes["content"] || null
      if (!cover) {
        let img = doc.querySelector(".head-cover")
        if (img) cover = img.attributes["src"] || null
      }

      let description = null
      let metaDesc = doc.querySelector("meta[property='og:description']")
      if (metaDesc) description = (metaDesc.attributes["content"] || "").trim()
      if (!description) {
        let descEl = doc.querySelector(".head-info-desc")
        if (descEl) description = descEl.text.trim()
      }

      let authors = []
      for (let el of doc.querySelectorAll(".head-info-author .author-wr")) {
        let t = el.text.replace(/\s+/g, " ").trim()
        if (t) authors.push(t)
      }

      let status = null
      let statusEl = doc.querySelector(".mod-chapter-title span")
      if (statusEl) status = statusEl.text.replace(/\s+/g, " ").trim()

      // 题材标签：keywords 形如 “书名,书名漫画,书名在线阅读,书名免费,异能漫画,腾讯动漫”
      let themes = []
      let metaKw = doc.querySelector("meta[name='keywords']")
      if (metaKw) {
        for (let part of (metaKw.attributes["content"] || "").split(",")) {
          let t = part.trim()
          if (!t) continue
          if (t.indexOf(title) >= 0) continue
          if (t === "腾讯动漫") continue
          if (/在线阅读$|免费$/.test(t)) continue
          t = t.replace(/漫画$/, "")
          if (t && themes.indexOf(t) < 0) themes.push(t)
        }
      }

      // 章节列表（页面里有两份：横排 + 底部完整列表），按 seq 升序
      let items = []
      let seenCid = {}
      for (let a of doc.querySelectorAll("a.chapter-link")) {
        let cid = a.attributes["data-cid"]
        if (!cid || seenCid[cid]) continue
        let seq = parseInt(a.attributes["data-seq"] || "0", 10)
        let tEl = a.querySelector(".comic-title") || a.querySelector(".chapter-title")
        let name = tEl ? tEl.text : a.attributes["title"] || a.text
        name = String(name).replace(/\s+/g, " ").trim().replace(/^\d+\s*-\s*/, "")
        if (!name) name = `第${seq}话`
        seenCid[cid] = 1
        items.push([seq, String(cid), name])
      }
      items.sort((a, b) => a[0] - b[0])
      let chapters = new Map()
      for (let it of items) chapters.set(it[1], it[2])

      doc.dispose()
      return new ComicDetails({
        title: title,
        subtitle: status,
        cover: cover,
        description: description,
        tags: { "作者": authors, "题材": themes },
        chapters: chapters,
        url: url,
      })
    },

    loadEp: async (comicId, epId) => {
      let pageUrl = `${TencentManHua.baseUrl}/chapter/index/id/${comicId}/cid/${epId}`
      let res = await Network.get(`${pageUrl}?style=plain`, {
        ...this.headers,
        "Referer": pageUrl,
        "X-Requested-With": "XMLHttpRequest",
      })
      if (res.status !== 200) throw `Invalid status code: ${res.status}`

      let data = TencentManHua.decodePlain(res.body)
      let pics = (data && data.picture) || []
      let images = []
      for (let p of pics) {
        let u = p && p.url
        if (u) images.push(u.startsWith("http") ? u : `https:${u}`)
      }
      if (!images.length) throw "该章节暂无可读图片（腾讯漫画多数新章节为付费内容）"
      return { images: images }
    },

    onImageLoad: (url, comicId, epId) => {
      // manhua.acimg.cn 实测不校验 Referer，带上以防 CDN 策略变化
      return {
        headers: {
          "User-Agent": TencentManHua.ua,
          "Referer": `${TencentManHua.baseUrl}/`,
          "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9",
        },
        onLoadFailed: () => ({
          headers: {
            "User-Agent": TencentManHua.ua,
            "Referer": `${TencentManHua.baseUrl}/`,
          },
        }),
      }
    },
  }

  // style=plain 的章节接口：第 1 行是“插入了随机字符的 base64”，
  // 第 2 行是 window["non"+"ce"] = "..." 形式的 nonce，用 nonce 里的 数字+字母 片段还原字符串
  static decodePlain(body) {
    let text = String(body).replace(/^[\s\uFEFF]+|[\s\uFEFF]+$/g, "")
    let lines = text.split("\n")
    if (lines.length < 2) throw "章节数据格式异常"
    let raw = lines[0].split("")
    let nonce = TencentManHua.extractNonce(lines[1])
    let tokens = nonce.match(/\d+[a-zA-Z]+/g) || []
    for (let i = tokens.length - 1; i >= 0; i--) {
      let pos = (parseInt(tokens[i], 10) & 255)
      let letters = tokens[i].replace(/\d+/g, "")
      raw.splice(pos, letters.length)
    }
    let bytes = Convert.decodeBase64(raw.join(""))
    let json = Convert.decodeUtf8(bytes)
    return JSON.parse(json)
  }

  // 解析 nonce 那一行：把字符串字面量与 (+eval("...")).toString() 依次拼接起来
  static extractNonce(line) {
    let eq = line.indexOf("=")
    let expr = eq >= 0 ? line.slice(eq + 1) : line
    let out = ""
    let i = 0
    while (i < expr.length) {
      let c = expr[i]
      if (c === '"' || c === "'") {
        let j = i + 1
        let buf = ""
        while (j < expr.length && expr[j] !== c) {
          if (expr[j] === "\\") {
            buf += expr[j + 1]
            j += 2
            continue
          }
          buf += expr[j]
          j++
        }
        out += buf
        i = j + 1
        continue
      }
      if (expr.slice(i, i + 5) === "eval(") {
        // 扫描到与 eval( 配对的右括号（参数里可能含字符串，如 document.getElementsByTagName('html')）
        let depth = 0
        let j = i + 4
        let end = -1
        while (j < expr.length) {
          let ch = expr[j]
          if (ch === '"' || ch === "'") {
            let q = ch
            j++
            while (j < expr.length && expr[j] !== q) {
              if (expr[j] === "\\") j++
              j++
            }
          } else if (ch === "(") {
            depth++
          } else if (ch === ")") {
            depth--
            if (depth === 0) {
              end = j
              break
            }
          }
          j++
        }
        if (end < 0) {
          i += 5
          continue
        }
        let arg = expr.slice(i + 5, end).replace(/^\s+|\s+$/g, "")
        if (arg.length > 1 && (arg[0] === '"' || arg[0] === "'") && arg[arg.length - 1] === arg[0]) {
          arg = arg.slice(1, -1)
        }
        // 站点写法为 (+eval("...")).toString()，即先做一元 + 转换（true->1 / "3"->3）
        let pre = expr.slice(Math.max(0, i - 3), i)
        let v = TencentManHua.evalSimple(arg)
        out += pre.indexOf("+") >= 0 ? String(+v) : String(v)
        i = end + 1
        continue
      }
      i++
    }
    return out
  }

  static evalSimple(code) {
    let s = String(code).replace(/\s+/g, "")
    if (!s || s.length > 200) return ""
    if (!/^[A-Za-z0-9_$+\-*/().!<>=&|?:~^%'"\[\],{}]+$/.test(s)) return ""
    // 站点会在表达式里访问 DOM，例如 !!document.getElementsByTagName('html')，
    // 这里给出等价的“真值”桩对象，使结果与浏览器一致（这些表达式的结果对任何环境都相同）
    let document = {
      getElementsByTagName: () => ({ length: 1 }),
      getElementById: () => ({}),
      querySelector: () => ({}),
      querySelectorAll: () => ({ length: 1 }),
      createElement: () => ({}),
      cookie: "",
      referrer: "",
    }
    let window = { document: document }
    let navigator = { userAgent: "Mozilla/5.0", platform: "Android" }
    let location = { href: "" }
    try {
      // eslint-disable-next-line no-eval
      return eval(`(${s})`)
    } catch (e) {
      return ""
    }
  }
}
