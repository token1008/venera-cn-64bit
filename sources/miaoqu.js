// ============================================================================
// 喵趣漫画 / 妙趣漫画 —— www.miaoqumh.org
// ----------------------------------------------------------------------------
// 站点形态（2026-09-21 本机 curl + 手机 UA 实测）：
//   * 前端模板 template/pc/tiantangmanhua（天堂漫画模板），后端是 PHP 框架 Mccms
//   * 内容是「包子漫画」镜像换皮：封面 static-tw.baozimh.com，
//     章节正文图 s2.bzcdn.net，详情 JSON 里 comic_source_url = http://bz.mh.com/comic/<包子slug>
//   * Cloudflare 前置，裸域 301 → www；以下请求一律带手机 UA
//
// 路由表（每一条都实测过返回码，不是猜的）：
//   首页                GET /                              → 200
//   分类列表            GET /category                      → 200，每页 35 条
//   分类翻页            GET /category/page/<n>             → 200（n ≤ 50，末页 = /category/page/50）
//   地区筛选            GET /category/city/<42|43|44|45|134> → 200（内地/港台/韩国/日本/欧美）
//   来源筛选            GET /category/list/<1|2|3|4>        → 200（国产/日本/韩国/欧美）
//   状态筛选            GET /category/finish/<1|2>          → 200（连载/完结）
//   题材筛选            GET /category/tags/<215..238>       → 200（爆笑/生活/修真/…）
//   筛选 + 翻页         GET /category/tags/215/page/2       → 200（筛选路径下同样可翻页）
//   追新（无翻页）      GET /custom/news                     → 200
//   排行（无翻页）      GET /custom/top                      → 200
//   详情                GET /<slug>                          → 200，例 /douluodalu5zhongshengtangsan
//                       站内还存在 /<slug>_<数字> 形式的别名（例 /mohuangdaguanjia_260059），
//                       两种写法都能打开同一本（实测均为 200，title 相同）
//   章节（阅读页）      GET /<comicId>/<章节id>.html         → 200，例 /233587/58305.html
//   埋点                GET /api/hits/comic/<comicId>        → 200，9 字节 JS；详情页里内联了它，
//                       可用来反查数字 mid
//
// JSON 接口（都属于 Mccms 的 api 控制器，实测路径与字段如下）：
//   GET /api/comic/list?limit=<≤100>&list=<1..4>
//        → {"code":1,"data":[{"name","author","pic","tags","url"}]}   limit 上限 100，超出按 100
//   GET /api/comic/hot
//        → {"code":1,"data":[{"id","pic","name","author","text","url"}]}
//   GET /api/comic/chapter?mid=<comicId>
//        → {"code":1,"data":[{"id","name","link","pnum","date","price","vip","cion"}]}
//   GET /api/comic/index?mid=<comicId>
//        → {"code":1,"data":{comic_name, comic_author, comic_pic, comic_content,
//           comic_serialize(连载/完结), comic_score, comic_nums, comic_chapter_list:[...]}}
//
// ⚠ 站点自身的搜索已经坏了（这是本源唯一妥协的地方，证据如下，全部 2026-09-21 实测）：
//   GET /search?key=<kw>              → 404（22 字节纯文本 "404 Not Found"，CF 头里
//                                        cfOrigin;dur≈330 说明是源站直出，不是 CF 拦的）
//   GET /index.php/search?key=<kw>    → 404（m 站搜索框的 onclick 就写死指向这里）
//   GET /custom/search?key=<kw>       → 200，但正文只有「缺少模板文件：custom/search.html」
//   GET /search?q=<kw>（包子写法）    → 404
//   GET /api/comic/search、/api/search、/api/comic/so / find / query / keyword …→ 框架 404
//   /api/comic 控制器只有 index / list / hot / chapter 四个方法（穷举法验证：
//   未知方法一律抛「404 Page Not Found」，已知的 index 抛的是 DB 错误，形态完全不同）
//   首页与详情页里模板自己渲染出来的 /search?key=<作者> 链接点开也是 404。
//   → 结论：站方把搜索路由/模板弄丢了，不是 UA、Cookie 或参数问题。
//
//   于是 search 改为「本地索引」方案：
//     首次搜索时把站点自己的分类列表页（/category/page/1..N，按站点「经典」排序，
//     即人气最高的前 N*35 本）+ /api/comic/hot 抓下来，去重后缓存在源数据里
//     （searchIndex，TTL 7 天），之后按关键词在本地过滤（标题或作者包含即命中）。
//     站点分类页共 50 页 / 1750 本可见（页面自称全站 80625 本），所以热门口碑作基本都搜得到，
//     冷门作品可能搜不到 —— 这是站点搜索坏掉后的折中，源本身没有更好的办法。
//
// ----------------------------------------------------------------------------
// 图片（本源的逆向重点）：
//   章节页不直接给图片地址，而是内联一段密文：
//       <script>var cid=58305; var DATA='bx5FJCxl…';</script>
//   解密逻辑来自模板自带的 /template/pc/tiantangmanhua/js/pic.js（jsjiami.com.v7 混淆，
//   已把 decryptData 还原出来）：
//     1) 页内固定 10 个 base64 密钥，取第 (cid % 10) 个，base64 解码得到 9 字节 ASCII 密钥
//        （例如 cid=58305 → 58305%10=5 → "OC02TU0yRWk=" → "8-6MM2Ei"）
//     2) DATA 先 base64 解码得到字节流，再逐字节 XOR 密钥（密钥按位置循环取模）
//     3) XOR 结果是一段 ASCII base64 文本 → 再 base64 解码 → UTF-8 → JSON
//     4) JSON = [{"id":"233587583050","url":"https://s2.bzcdn.net/scomic/<包子slug>/0/0-78v2/1.jpg"}, …]
//   实测（2026-09-21，用 pic.js 原函数跑 cid=58305，得到 9 条 url；再用 curl 直取）：
//     GET https://s2.bzcdn.net/scomic/douluodalu5zhongshengtangsan-shenmanjun/0/0-78v2/1.jpg
//       → 200, 1303690 字节, image/jpeg, magic = ff d8 ff e0 (JFIF)
//   **图片本身没有二次加密**，解密只针对「图片列表」。
//
//   另：第三方调研说正文图走混淆 CDN  *-cdn.imgresovrces.net:23647，请求头要带
//   channel: miaofun、referer: com.paokeji.yiqu（那是「喵趣 App」的私有接口）。经本机实测，
//   本站 web 镜像的正文图就是包子 CDN s2.bzcdn.net 的裸 jpg，直连可取真图，故未采用那套头。
//   同时验证 /w640 之类的质量后缀在本站 CDN 上是 404（包子的源支持、本站不支持），不要加。
// ============================================================================

class MiaoQu extends ComicSource {
  name = "喵趣漫画"

  key = "miaoqu"

  version = "1.0.0"

  minAppVersion = "1.0.0"

  url = "https://cdn.jsdelivr.net/gh/token1008/venera-cn-64bit@main/sources-direct/miaoqu.js"

  static baseUrl = "https://www.miaoqumh.org"

  // 站点 Cloudflare 前置，桌面 UA 也能开，但模板自己按 UA 跳 m 站；统一用手机 UA 最稳
  static ua = "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

  // ---- 章节图片密文的 10 个 XOR 密钥（base64），取自模板 pic.js 的 _0x5901db 数组，
  //      经还原后的 decryptData 反解确认。密钥序号 = 章节数字 id % 10 ----
  static imgKeys = [
    "OC1iWGQ5aU4=", // 0 → 8-bXd9iN
    "OC1SWHlqcnk=", // 1 → 8-RXyjry
    "OC1vWXZ3Vnk=", // 2 → 8-oYvwVy
    "OC00Wlk1N1U=", // 3 → 8-4ZY57U
    "OC1tYkpwVTc=", // 4 → 8-mbJpU7
    "OC02TU0yRWk=", // 5 → 8-6MM2Ei
    "OC01NFRpUXI=", // 6 → 8-54TiQr
    "OC1QaDV4eDk=", // 7 → 8-Ph5xx9
    "OC1iWWdlUFI=", // 8 → 8-bYgePR
    "OC1aOUEzYlc=", // 9 → 8-Z9A3bW
  ]

  // ---- 本地搜索索引：抓站点分类页的页数（每页 35 条）与缓存有效期 ----
  static indexPages = 20 // → 700 本；调大可覆盖更多冷门作品，代价是首次搜索更慢

  static indexTtl = 7 * 24 * 3600 * 1000 // 7 天

  // 分类页 #mangawrap 每页 35 条，抓索引时并发 8 路
  static indexConcurrency = 8

  // 探索页定义：[标题, 站点路径, 是否可翻页]
  // 路径全部实测 200（2026-09-21）。可翻页的走 /<path>/page/<n>，不可翻页的固定第 1 页。
  static exploreDefs = [
    ["漫画大全", "category", true],
    ["最近更新", "custom/news", false],
    ["排行榜", "custom/top", false],
    ["国产漫画", "category/list/1", true],
    ["日本漫画", "category/list/2", true],
    ["韩国漫画", "category/list/3", true],
    ["欧美漫画", "category/list/4", true],
    ["连载中", "category/finish/1", true],
    ["已完结", "category/finish/2", true],
    ["地区·内地", "category/city/42", true],
    ["地区·港台", "category/city/43", true],
    ["地区·韩国", "category/city/44", true],
    ["地区·日本", "category/city/45", true],
    ["地区·欧美", "category/city/134", true],
    ["爆笑", "category/tags/215", true],
    ["生活", "category/tags/216", true],
    ["灵异", "category/tags/217", true],
    ["神魔", "category/tags/218", true],
    ["日常", "category/tags/219", true],
    ["总裁", "category/tags/220", true],
    ["修真", "category/tags/221", true],
    ["精品", "category/tags/222", true],
    ["战斗", "category/tags/223", true],
    ["漫改", "category/tags/224", true],
    ["新作", "category/tags/225", true],
    ["神仙", "category/tags/226", true],
    ["改编", "category/tags/227", true],
    ["校园", "category/tags/228", true],
    ["治愈", "category/tags/229", true],
    ["霸总", "category/tags/230", true],
    ["爆更", "category/tags/231", true],
    ["社会", "category/tags/232", true],
    ["防疫", "category/tags/233", true],
    ["剧情", "category/tags/234", true],
    ["美食", "category/tags/235", true],
    ["奇幻", "category/tags/236", true],
    ["恐怖", "category/tags/237", true],
    ["动作", "category/tags/238", true],
  ]

  get headers() {
    return {
      "User-Agent": MiaoQu.ua,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "Referer": MiaoQu.baseUrl + "/",
    }
  }

  _abs(path) {
    if (!path) return MiaoQu.baseUrl + "/"
    let p = String(path)
    if (p.indexOf("http") === 0) return p
    if (p.charAt(0) !== "/") p = "/" + p
    return MiaoQu.baseUrl + p
  }

  // 站点走 Cloudflare，偶发 403/429/5xx 的 JS 跳转页，重试两三次基本就 200
  async _get(url, headers) {
    let last = 0
    for (let i = 0; i < 3; i++) {
      let res = await Network.get(url, headers || this.headers)
      if (res.status === 200) return res
      last = res.status
      if (res.status !== 403 && res.status !== 429 && res.status < 500) break
    }
    throw `Invalid status code: ${last}`
  }

  // 封面有两个域名；static-tw.baozimhcn.com 在部分网络下 TLS 直接失败（实测
  // CRYPT_E_REVOCATION_OFFLINE / 连接重置），同一张图在 static-tw.baozimh.com 上是 200，
  // 所以统一改写到实测可用的 .com 域。
  static fixCover(u) {
    if (!u) return ""
    let s = String(u)
    s = s.replace("//static-tw.baozimhcn.com/", "//static-tw.baozimh.com/")
    return s
  }

  // 分类/列表页：<ul id="mangawrap"> 下每个 <li> 一条
  //   <a class="manga-img" style="background: url(<封面>)">
  //   <a class="manga-name" title="<干净标题>" href="/<slug>">
  //   <p class="manga-desc"><a class="manga-author">作者</a><a class="manga-update">第185话</a></p>
  _parseList(doc) {
    let out = []
    let box = doc.querySelector("#mangawrap")
    if (!box) return out
    for (let li of box.querySelectorAll("li")) {
      let imgA = li.querySelector("a.manga-img")
      let nameA = li.querySelector("a.manga-name")
      if (!imgA || !nameA) continue
      let href = nameA.attributes["href"] || imgA.attributes["href"] || ""
      if (!href) continue
      let title = nameA.attributes["title"] || nameA.text.trim()
      if (!title) continue
      // 封面藏在 style 的 url(...) 里，没有 <img>
      let style = imgA.attributes["style"] || ""
      let m = style.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/)
      let cover = m ? MiaoQu.fixCover(m[1]) : ""
      let authorEl = li.querySelector("a.manga-author")
      let updEl = li.querySelector("a.manga-update")
      let author = authorEl ? authorEl.text.trim() : ""
      out.push({
        id: this._abs(href),
        title: title,
        // Comic.cover 在 Dart 侧是非空 String，传 null 会让整页崩；空串兜底
        cover: cover || "",
        author: author,
        latest: updEl ? updEl.text.trim() : "",
        tags: author ? [author] : [],
      })
    }
    return out
  }

  // 翻页器：PC 分类页是 .page-btns（含 href="/category/page/50" 的末页）
  _maxPage(doc, page) {
    let max = page
    let boxes = [".page-btns", ".pagebox"]
    for (let sel of boxes) {
      let box = doc.querySelector(sel)
      if (!box) continue
      for (let a of box.querySelectorAll("a")) {
        let href = a.attributes["href"] || ""
        let m = href.match(/\/page\/(\d+)/)
        if (m) {
          let n = parseInt(m[1], 10)
          if (n > max) max = n
        }
      }
    }
    return max
  }

  _listUrl(path, page) {
    if (page <= 1) return `${MiaoQu.baseUrl}/${path}`
    return `${MiaoQu.baseUrl}/${path}/page/${page}`
  }

  explore = MiaoQu.exploreDefs.map((def) => {
    let title = def[0]
    let path = def[1]
    let paged = def[2]
    return {
      title: title,
      type: "multiPageComicList",
      load: async (page) => {
        if (!paged) page = 1
        let res = await this._get(this._listUrl(path, page))
        let doc = new HtmlDocument(res.body)
        let comics = this._parseList(doc).map(
          (c) =>
            new Comic({
              id: c.id,
              title: c.title,
              cover: c.cover || "",
              subtitle: c.latest || null,
              tags: c.tags,
            })
        )
        let maxPage = paged && comics.length > 0 ? this._maxPage(doc, page) : page
        return { comics: comics, maxPage: maxPage }
      },
    }
  })

  // ------------------------------------------------------------------
  // 搜索：站点自身的 /search 已 404（见文件头说明），所以走本地索引
  // ------------------------------------------------------------------

  async _getIndex() {
    let cache = null
    try {
      let raw = this.loadData("searchIndex")
      if (raw) cache = JSON.parse(raw)
    } catch (e) {
      cache = null
    }
    let now = Date.now()
    if (
      cache &&
      cache.at &&
      Array.isArray(cache.items) &&
      cache.items.length &&
      now - cache.at < MiaoQu.indexTtl
    ) {
      return cache.items
    }
    let items = []
    try {
      items = await this._buildIndex()
    } catch (e) {
      items = []
    }
    if (items.length) {
      try {
        this.saveData("searchIndex", JSON.stringify({ at: now, items: items }))
      } catch (e) {
        // 存不下也不影响本次搜索
      }
      return items
    }
    // 构建失败时退回旧缓存
    if (cache && Array.isArray(cache.items)) return cache.items
    return []
  }

  // 并发抓一批页面，单页失败不影响整体
  async _fetchAll(urls) {
    let out = []
    let queue = urls.slice()
    let workers = []
    let n = MiaoQu.indexConcurrency
    for (let i = 0; i < n; i++) {
      workers.push(
        (async () => {
          while (queue.length > 0) {
            let u = queue.shift()
            try {
              let res = await this._get(u)
              out.push(res.body)
            } catch (e) {
              // 忽略单页失败
            }
          }
        })()
      )
    }
    await Promise.all(workers)
    return out
  }

  async _buildIndex() {
    let map = new Map()
    let add = (id, title, cover, author) => {
      if (!id || !title) return
      let key = String(id)
      if (map.has(key)) return
      map.set(key, {
        id: key,
        title: title,
        cover: MiaoQu.fixCover(cover) || "",
        author: author || "",
      })
    }

    // 1) /api/comic/hot（JSON，10 条，含 id + url）
    try {
      let res = await this._get(`${MiaoQu.baseUrl}/api/comic/hot`)
      let d = JSON.parse(res.body)
      let arr = d && d.data ? d.data : []
      for (let it of arr) add(this._abs(it.url), it.name, it.pic, it.author)
    } catch (e) {
      // hot 接口失败不致命
    }

    // 2) 分类列表页前 indexPages 页（站点按「经典」热度排序，即最热的前 N*35 本）
    let urls = []
    for (let i = 1; i <= MiaoQu.indexPages; i++) {
      urls.push(this._listUrl("category", i))
    }
    let bodies = await this._fetchAll(urls)
    for (let body of bodies) {
      try {
        let doc = new HtmlDocument(body)
        for (let c of this._parseList(doc)) add(c.id, c.title, c.cover, c.author)
      } catch (e) {
        // 单页解析失败忽略
      }
    }
    return Array.from(map.values())
  }

  search = {
    load: async (keyword, options, page) => {
      let kw = String(keyword || "").trim().toLowerCase()
      if (!kw) return { comics: [], maxPage: 1 }
      let items = await this._getIndex()
      let hit = []
      for (let it of items) {
        let t = String(it.title || "").toLowerCase()
        let a = String(it.author || "").toLowerCase()
        if (t.indexOf(kw) >= 0 || (a && a.indexOf(kw) >= 0)) hit.push(it)
      }
      let per = 20
      let maxPage = Math.max(1, Math.ceil(hit.length / per))
      let p = page > 0 ? page : 1
      let slice = hit.slice((p - 1) * per, p * per)
      return {
        comics: slice.map(
          (it) =>
            new Comic({
              id: it.id,
              title: it.title,
              cover: it.cover || "",
              subtitle: it.author || null,
              tags: it.author ? [it.author] : [],
            })
        ),
        maxPage: maxPage,
      }
    },

    optionList: [],
  }

  comic = {
    // 详情页结构（实测 /douluodalu5zhongshengtangsan）：
    //   .manga-img img                 封面
    //   .manga-title h1                标题；.manga-grade-num 评分
    //   .manga-author .author          作者；.manga-author .time 最新话
    //   .manga-desc .manga-desc-font   简介
    //   .manga-episodes_text           状态文本「连载(话):」/「完结(话):」
    //   #episodes a.epsbox-eplink      章节（title="<漫画名>:<章节名>" href="/<mid>/<cid>.html"）
    // 章节 DOM 顺序就是阅读顺序（实测 序章 → 01 → 02 …；另一本 1079 话的也是第1话→第875话），
    // 页面上的 "1." "2." 前缀是模板循环序号，不可当话号用，所以保持 DOM 顺序并去重。
    loadInfo: async (id) => {
      let url = this._abs(id)
      let res = await this._get(url)
      let doc = new HtmlDocument(res.body)

      let titleEl = doc.querySelector(".manga-title h1") || doc.querySelector("h1")
      let title = titleEl ? titleEl.text.trim() : ""
      if (!title) throw "Comic not found"

      let coverEl = doc.querySelector(".manga-img img")
      let cover = coverEl ? coverEl.attributes["src"] || coverEl.attributes["data-src"] : ""
      cover = MiaoQu.fixCover(cover) || ""

      let descEl = doc.querySelector(".manga-desc-font") || doc.querySelector(".manga-desc p")
      let desc = descEl ? descEl.text.trim() : ""

      let authorEl = doc.querySelector(".manga-author .author")
      let author = authorEl ? authorEl.text.trim() : ""
      let latestEl = doc.querySelector(".manga-author .time")
      let latest = latestEl ? latestEl.text.trim() : ""

      let statusEl = doc.querySelector(".manga-episodes_text")
      let status = ""
      if (statusEl) {
        let m = statusEl.text.match(/(连载|完结)/)
        if (m) status = m[1]
      }

      let chapters = new Map()
      for (let a of doc.querySelectorAll("#episodes a.epsbox-eplink")) {
        let href = a.attributes["href"] || ""
        if (!href) continue
        if (href.indexOf("javascript") === 0) continue
        let name = a.attributes["title"] || ""
        // title 形如 "斗罗大陆5重生唐三:序章 " → 去掉「漫画名:」前缀
        let i = name.indexOf(":")
        if (i < 0) i = name.indexOf("：")
        if (i > 0) name = name.slice(i + 1)
        name = name.trim()
        if (!name) name = a.text.trim()
        if (!name) continue
        chapters.set(this._abs(href), name)
      }
      if (chapters.size === 0) throw "章节列表为空"

      let tags = {}
      if (status) tags["状态"] = [status]
      if (author) tags["作者"] = [author]
      if (latest) tags["最新"] = [latest]

      return new ComicDetails({
        title: title,
        subtitle: status || null,
        cover: cover,
        description: desc,
        tags: tags,
        chapters: chapters,
        updateTime: null,
        url: url,
      })
    },

    // 章节页：取 var cid=<数字> 与 var DATA='<base64>'，按 pic.js 的算法解密出图片列表
    loadEp: async (comicId, epId) => {
      let url = this._abs(epId)
      let res = await this._get(url, { ...this.headers, "Referer": this._abs(comicId) })
      let body = res.body
      let dataM = body.match(/var\s+DATA\s*=\s*'([^']+)'/)
      if (!dataM) {
        throw "该章节没有图片数据（可能已下架，或为付费/VIP 章节）"
      }
      let cidM = body.match(/var\s+cid\s*=\s*(\d+)/)
      let cid = cidM ? parseInt(cidM[1], 10) : 0
      let list = MiaoQu.decryptImages(cid, dataM[1])
      let images = []
      for (let it of list) {
        if (it && it.url) images.push(MiaoQu.fixCover(it.url))
      }
      if (images.length === 0) throw "解密后图片列表为空"
      return { images: images }
    },

    onImageLoad: (url, comicId, epId) => {
      // 图片是包子 CDN s2.bzcdn.net 的裸图，实测不带 Referer 也返回真图；
      // 仍显式带 UA + 本站 Referer，避免 CDN 策略变化后黑屏
      return {
        headers: {
          "User-Agent": MiaoQu.ua,
          "Referer": MiaoQu.baseUrl + "/",
          "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9",
        },
        onLoadFailed: () => {
          return {
            headers: {
              "User-Agent": MiaoQu.ua,
              "Referer": MiaoQu.baseUrl + "/",
            },
          }
        },
      }
    },

    // 封面走的是包子封面 CDN（App 的封面加载不经过 onImageLoad，也不支持 onLoadFailed 重试），
    // 所以这里同步换掉死域名并带上 UA/Referer。必须返回对象，返回 Promise 会被判非法。
    onThumbnailLoad: (url) => {
      return {
        url: MiaoQu.fixCover(url),
        headers: {
          "User-Agent": MiaoQu.ua,
          "Referer": MiaoQu.baseUrl + "/",
        },
      }
    },
  }

  // ------------------------------------------------------------------
  // 章节图片列表解密（等价于模板 pic.js 的 decryptData，去混淆后的写法）
  //   key   = base64decode(imgKeys[cid % 10])            // 9 字节 ASCII
  //   raw   = base64decode(DATA)                         // 密文字节
  //   x[i]  = raw[i] ^ key[i % key.length]
  //   json  = utf8(base64decode(ascii(x)))               // 结果本身是一段 base64 文本
  // ------------------------------------------------------------------
  static decryptImages(cid, DATA) {
    let idx = cid % MiaoQu.imgKeys.length
    if (idx < 0) idx += MiaoQu.imgKeys.length
    let key = new Uint8Array(Convert.decodeBase64(MiaoQu.imgKeys[idx]))
    let raw = new Uint8Array(Convert.decodeBase64(DATA))
    let x = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) {
      x[i] = raw[i] ^ key[i % key.length]
    }
    let text = Convert.decodeUtf8(x.buffer)
    let out = Convert.decodeUtf8(Convert.decodeBase64(text))
    return JSON.parse(out)
  }
}
