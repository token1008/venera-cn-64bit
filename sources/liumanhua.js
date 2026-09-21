// ============================================================================
// 六漫画 —— www.liumanhua.com
// ----------------------------------------------------------------------------
// 站点形态（2026-09-21 本机 curl + 手机 UA 全部实测）：
//   * 后端同样是 PHP 框架 Mccms（/packs/mccms/base.js、/index.php/api/... 路由形态）
//   * 前端 PC 模板 template/pc/liumanhua（列表是服务端渲染，详情页章节表是 JS 拉 JSON）
//   * 内容与包子漫画同源：封面 static-tw.baozimh.com，正文图 s2.bzcdn.net
//   * 与本源目录里的 manhuaba.js（漫画吧网）是同一套模板家族：**连 AES 密钥都一样**
//     （manhuaba.js 里那个 "9S8$vJnU2ANeSRoF"，本站 index-v2.js 里同样硬编码）
//
// 路由表（逐条实测返回码）：
//   分类列表          GET /category                    → 200，每页 30 条
//   分类翻页          GET /category/page/<n>           → 200（页尾有数字页码，尾页 /category/page/50）
//   来源筛选          GET /category/list/<1..4>        → 200（国产/日本/韩国/欧美）
//   状态筛选          GET /category/finish/<1|2>       → 200（连载/完结）
//   地区筛选          GET /category/city/<42,44,45,134>→ 200；42=内地 43=港台(站内无数据,0 条)
//                                                        44=韩国 45=日本 134=欧美
//   题材筛选          GET /category/tags/<215..238>    → 200（实测 24 个题材全部 200 且有内容）
//   排行榜            GET /custom/hot                  → 200（50 条）
//   搜索              GET /search?key=<kw>             → 200，每页 30 条；
//                     翻页 GET /search/<kw>/<page>     → 200（实测 key=神 有 10+ 页）
//                     ⚠ 注意 URL 里 keyword 不编码，中文直接放路径
//   详情              GET /<mid>                       → 200（mid 是纯数字，例 /219419）
//   章节（阅读页）    GET /<mid>/<cid>.html            → 200
//   章节表(JSON)      GET /api/comic/chapter?mid=<mid>  → {"code":1,"data":[{id,name,piclink,pnum,price,vip,cion,addtime}]}
//   详情(JSON)        GET /api/comic/index?mid=<mid>    → 详情字段（封面/简介/状态/章节表）
//   埋点              GET /api/hits/comic/<mid>         → 200，9 字节 JS；详情页里内联了它，用它反查数字 mid
//
// 已知站点侧问题（不是源的 bug）：
//   * `/custom/update`（最新更新）返回 200 但列表为空；`/category/city/43`（港台）无数据。
//   * 老漫画的数据被站方清了：例 武炼巅峰 /219419 详情页正常，但所有章节页都返回
//     268 字节「很遗憾，该漫画不存在或章节已被删除」（实测 149363 / 226140 / 152181 三个都如此）。
//     详情页里它的状态是「已下架」。→ loadEp 遇到这种页面会明确报错。
//   * `/api/comic/chapter` 单次最多返回 1000 章（6883 章的长篇会被截断，实测）。
//   * `/index.php/api/data/comic?key=<kw>` 这个前台搜索接口被站方关掉了，回
//     {"msg":"非法请求","code":-1}（带 callback、带 Referer、带 Cookie 都一样）。
//     但 **服务端渲染的 /search?key= 是好的**，所以搜索走 HTML 解析，不需要本地索引。
//
// ----------------------------------------------------------------------------
// 图片：
//   阅读页不直接给 img，而是内联一段 Base64 密文：
//       <script>var tpl_path='…', params = '<base64>'; readPic(mid,cid,0,0);</script>
//   解密（来自模板 /template/pc/liumanhua/js/index-v2.js 里 jsjiami 混淆的 decryptParams，
//   已还原并实测两章）：
//     1) Base64 解码 params → 字节流
//     2) 前 16 字节 = AES-128-CBC 的 IV，其后全部为密文
//     3) key = "9S8$vJnU2ANeSRoF"（16 字节 ASCII，jsjiami 字符串表里取出的常量，模板级固定）
//     4) 明文是 UTF-8 JSON：{host, source_id, comic_id, chapter_id, images:[...], lazy}
//   实测两例（2026-09-21）：
//     /613989/224099.html → 5 张 https://s2.bzcdn.net/scomic/guoyuandeqingkuang-jjanggeol/0/1-z3hc/N.jpg
//     /239444/212622.html → https://s2.bzcdn.net/scomic/zhaoxunxinzhangfu-mogmadanhaeneul/0/1-tpr1/N.jpg
//   **图片本身就是包子 CDN 的裸 jpg，没有二次加密**；AES 只保护图片列表。
//   注：阅读页对 VIP 章节会弹「VIP会员专属章节」浮层，但 params 依旧内联在 HTML 里，
//   实测第0话（vip 章节）照样解得出图片列表；解不出来时本源会明确报错而不是静默空列表。
// ============================================================================

class LiuManHua extends ComicSource {
  name = "六漫画"

  key = "liumanhua"

  version = "1.0.0"

  minAppVersion = "1.0.0"

  url = "https://cdn.jsdelivr.net/gh/token1008/venera-cn-64bit@main/sources-direct/liumanhua.js"

  static baseUrl = "https://www.liumanhua.com"

  static ua = "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

  // 章节页 params 的 AES-128-CBC 密钥（模板 index-v2.js 内硬编码常量，实测有效）
  static aesKey = "9S8$vJnU2ANeSRoF"

  // 探索页定义：[标题, 路径]（路径全部实测 200 且有内容，2026-09-21）
  static exploreDefs = [
    ["漫画大全", "category"],
    ["排行榜", "custom/hot"],
    ["国产漫画", "category/list/1"],
    ["日本漫画", "category/list/2"],
    ["韩国漫画", "category/list/3"],
    ["欧美漫画", "category/list/4"],
    ["连载中", "category/finish/1"],
    ["已完结", "category/finish/2"],
    ["地区·内地", "category/city/42"],
    ["地区·韩国", "category/city/44"],
    ["地区·日本", "category/city/45"],
    ["地区·欧美", "category/city/134"],
    ["爆笑", "category/tags/215"],
    ["生活", "category/tags/216"],
    ["灵异", "category/tags/217"],
    ["神魔", "category/tags/218"],
    ["日常", "category/tags/219"],
    ["总裁", "category/tags/220"],
    ["修真", "category/tags/221"],
    ["精品", "category/tags/222"],
    ["战斗", "category/tags/223"],
    ["漫改", "category/tags/224"],
    ["新作", "category/tags/225"],
    ["神仙", "category/tags/226"],
    ["改编", "category/tags/227"],
    ["校园", "category/tags/228"],
    ["治愈", "category/tags/229"],
    ["霸总", "category/tags/230"],
    ["爆更", "category/tags/231"],
    ["社会", "category/tags/232"],
    ["防疫", "category/tags/233"],
    ["剧情", "category/tags/234"],
    ["美食", "category/tags/235"],
    ["奇幻", "category/tags/236"],
    ["恐怖", "category/tags/237"],
    ["动作", "category/tags/238"],
  ]

  get headers() {
    return {
      "User-Agent": LiuManHua.ua,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "Referer": LiuManHua.baseUrl + "/",
    }
  }

  _abs(path) {
    if (!path) return LiuManHua.baseUrl + "/"
    let p = String(path)
    if (p.indexOf("http") === 0) return p
    if (p.charAt(0) !== "/") p = "/" + p
    return LiuManHua.baseUrl + p
  }

  async _get(url, headers) {
    let last = 0
    for (let i = 0; i < 3; i++) {
      let res = await Network.get(url, headers || this.headers)
      if (res.status === 200) return res
      last = res.status
      // 403/429/5xx 多为 Cloudflare 抖动，其余状态码没必要重试
      if (res.status !== 403 && res.status !== 429 && res.status < 500) break
    }
    throw `Invalid status code: ${last}`
  }

  // 封面有两个包子域名；baozimhcn 在部分网络下 TLS 直接失败，统一改写到实测可用的 .com
  static fixCover(u) {
    if (!u) return ""
    return String(u).replace("//static-tw.baozimhcn.com/", "//static-tw.baozimh.com/")
  }

  // 分类/搜索页列表：.cy_list_mh > ul（每本一个 ul）
  //   li > a.pic > img[src]          封面
  //   li.title > a[href]             标题
  //   li.zuozhe                      状态：连载中
  //   li.updata > a                  最新：第185话
  _parseList(doc) {
    let out = []
    for (let ul of doc.querySelectorAll(".cy_list_mh ul")) {
      let picA = ul.querySelector("a.pic")
      let titleA = ul.querySelector("li.title a")
      if (!picA || !titleA) continue
      let href = titleA.attributes["href"] || picA.attributes["href"] || ""
      if (!href || href.indexOf("/") !== 0) continue
      let title = titleA.text.trim() || titleA.attributes["title"] || ""
      if (!title) continue
      let img = picA.querySelector("img")
      let cover = img ? img.attributes["src"] || img.attributes["data-original"] : ""
      let st = ul.querySelector("li.zuozhe")
      let upd = ul.querySelector("li.updata a") || ul.querySelector("li.updata span")
      let tagsEl = ul.querySelector("li.biaoqian")
      let tags = []
      if (tagsEl) {
        for (let a of tagsEl.querySelectorAll("a")) {
          let t = a.text.trim()
          if (t) tags.push(t)
        }
      }
      out.push({
        id: this._abs(href),
        title: title,
        cover: LiuManHua.fixCover(cover) || "",
        subtitle: upd ? upd.text.trim() : st ? st.text.trim() : "",
        tags: tags,
      })
    }
    return out
  }

  // 页尾 .NewPages 里有数字页码（含 ?/page/50 尾页），直接取最大
  _maxPage(doc, page) {
    let max = page
    let box = doc.querySelector(".NewPages")
    if (box) {
      for (let a of box.querySelectorAll("a")) {
        let href = a.attributes["href"] || ""
        let m = href.match(/\/page\/(\d+)/) || href.match(/\/(\d+)$/)
        if (m) {
          let n = parseInt(m[1], 10)
          if (n > max) max = n
        }
      }
    }
    return max
  }

  _listUrl(path, page) {
    if (page <= 1) return `${LiuManHua.baseUrl}/${path}`
    return `${LiuManHua.baseUrl}/${path}/page/${page}`
  }

  explore = LiuManHua.exploreDefs.map((def) => ({
    title: def[0],
    type: "multiPageComicList",
    load: async (page) => {
      let res = await this._get(this._listUrl(def[1], page))
      let doc = new HtmlDocument(res.body)
      let comics = this._parseList(doc).map(
        (c) =>
          new Comic({
            id: c.id,
            title: c.title,
            cover: c.cover || "",
            subtitle: c.subtitle || null,
            tags: c.tags,
          })
      )
      let maxPage = comics.length > 0 ? this._maxPage(doc, page) : page
      return { comics: comics, maxPage: maxPage }
    },
  }))

  // 搜索：站方把接口式搜索（/index.php/api/data/comic?key=）关了，但服务端渲染的
  // /search?key= 是好用的，翻页是 /search/<kw>/<page>。
  // 关键词必须 URL 编码：原站链接里是裸中文，但客户端直接塞裸中文会 400，
  // 编码后 query 与 path 两种写法都实测 200（/search/%E7%A5%9E/2 → 29 条）。
  search = {
    load: async (keyword, options, page) => {
      let kw = String(keyword || "").trim()
      if (!kw) return { comics: [], maxPage: 1 }
      let k = encodeURIComponent(kw)
      let url = page <= 1 ? `${LiuManHua.baseUrl}/search?key=${k}` : `${LiuManHua.baseUrl}/search/${k}/${page}`
      let res = await this._get(url)
      let doc = new HtmlDocument(res.body)
      let comics = this._parseList(doc).map(
        (c) =>
          new Comic({
            id: c.id,
            title: c.title,
            cover: c.cover || "",
            subtitle: c.subtitle || null,
            tags: c.tags,
          })
      )
      let maxPage = comics.length > 0 ? this._maxPage(doc, page) : page
      return { comics: comics, maxPage: maxPage }
    },

    optionList: [],
  }

  comic = {
    // 详情页 /<mid>：.cy_info 里
    //   .cy_info_cover img.pic   封面
    //   .cy_title h1             标题
    //   .cy_xinxi span           作者/状态/类别/人气/评分
    //   #comic-description       简介
    // 章节表不在 HTML 里（前端 chapterMore() 走 JS），所以章节改用
    // /api/comic/chapter?mid=<mid>（JSON），最多 1000 条，且**常为最新在前**，需要翻回阅读顺序。
    loadInfo: async (id) => {
      let url = this._abs(id)
      let res = await this._get(url)
      let doc = new HtmlDocument(res.body)

      let titleEl = doc.querySelector(".cy_title h1") || doc.querySelector("h1")
      let title = titleEl ? titleEl.text.trim() : ""
      if (!title) throw "Comic not found"

      let coverEl = doc.querySelector(".cy_info_cover img") || doc.querySelector(".cy_info img")
      let cover = coverEl ? coverEl.attributes["src"] || coverEl.attributes["data-original"] : ""
      cover = LiuManHua.fixCover(cover) || ""

      let descEl = doc.querySelector("#comic-description")
      let desc = descEl ? descEl.text.trim() : ""

      let author = ""
      let status = ""
      let score = ""
      for (let span of doc.querySelectorAll(".cy_xinxi span")) {
        let t = span.text.trim()
        let a = span.querySelector("a")
        if (t.indexOf("作者") === 0 && a) author = a.text.trim()
        else if (t.indexOf("状态") === 0) status = t.replace(/^状态[:：]?/, "").trim()
        else if (t.indexOf("评分") === 0) score = t.replace(/^评分[:：]?/, "").trim()
      }

      // 详情页里内联了 <script src="/api/hits/comic/<mid>">，用它可以拿到数字 mid
      let mid = ""
      let m = res.body.match(/\/api\/hits\/comic\/(\d+)/)
      if (m) mid = m[1]

      let chapters = new Map()
      if (mid) {
        try {
          let cres = await this._get(`${LiuManHua.baseUrl}/api/comic/chapter?mid=${mid}`)
          let j = JSON.parse(cres.body)
          let list = []
          for (let it of j && j.data ? j.data : []) {
            let link = it.link || it.piclink || ""
            let name = it.name || ""
            if (!link || !name) continue
            list.push({ link: link, name: String(name).trim() })
          }
          // 站点的章节表常是「最新在前」，翻成阅读顺序
          list = LiuManHua.orderChapters(list)
          for (let it of list) chapters.set(this._abs(it.link), it.name)
        } catch (e) {
          // 章节接口失败时不静默：下面 chapters.size 为 0 会抛错
        }
      }
      if (chapters.size === 0) {
        throw "章节列表为空（该漫画可能已下架/章节被站方删除）"
      }

      let tags = {}
      if (status) tags["状态"] = [status]
      if (author) tags["作者"] = [author]
      if (score) tags["评分"] = [score]

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

    // 阅读页：内联 params（Base64 → 前 16B 是 IV，其余是 AES-128-CBC 密文）里是图片列表
    loadEp: async (comicId, epId) => {
      let url = this._abs(epId)
      let res = await this._get(url, { ...this.headers, "Referer": this._abs(comicId) })
      if (res.body.length < 1000) {
        // 站方已删章节时会返回 268 字节的「该漫画不存在或章节已被删除」
        throw "章节不存在或已被站点删除"
      }
      let data = LiuManHua.decryptParams(res.body)
      if (!data) throw "章节页没有可解密的图片列表（params 缺失或解密失败）"
      let images = []
      for (let u of data.images ? data.images : []) {
        if (u) images.push(LiuManHua.fixCover(u))
      }
      if (images.length === 0) throw "解密后图片列表为空（可能为付费/VIP 章节）"
      return { images: images }
    },

    onImageLoad: (url, comicId, epId) => {
      return {
        headers: {
          "User-Agent": LiuManHua.ua,
          "Referer": LiuManHua.baseUrl + "/",
          "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9",
        },
        onLoadFailed: () => {
          return {
            headers: {
              "User-Agent": LiuManHua.ua,
              "Referer": LiuManHua.baseUrl + "/",
            },
          }
        },
      }
    },

    onThumbnailLoad: (url) => {
      return {
        url: LiuManHua.fixCover(url),
        headers: {
          "User-Agent": LiuManHua.ua,
          "Referer": LiuManHua.baseUrl + "/",
        },
      }
    },
  }

  // 章节顺序整理：站点有时给「最新在前」。标题里的第一个数字当话号；
  // 如果相邻可比较的序号里 80% 以上是递减，就整体反转。
  static orderChapters(list) {
    if (list.length < 3) return list
    let nums = []
    for (let it of list) {
      let m = String(it.name).match(/(\d+(?:\.\d+)?)/)
      nums.push(m ? parseFloat(m[1]) : null)
    }
    let pairs = 0
    let desc = 0
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] === null || nums[i - 1] === null) continue
      pairs++
      if (nums[i] < nums[i - 1]) desc++
    }
    if (pairs > 3 && desc / pairs > 0.8) return list.slice().reverse()
    return list
  }

  // 章节页 params 解密（等价于模板 index-v2.js 里 jsjiami 混淆的 decryptParams）
  //   raw = base64(params)；iv = raw[0..16)；ct = raw[16..]
  //   key = "9S8$vJnU2ANeSRoF"（AES-128-CBC，PKCS7）
  //   明文 = UTF-8 JSON {host, source_id, comic_id, chapter_id, images, lazy}
  static decryptParams(html) {
    let m = String(html).match(/params\s*=\s*'([A-Za-z0-9+/=]+)'/)
    if (!m) return null
    let blob = new Uint8Array(Convert.decodeBase64(m[1]))
    if (blob.length <= 16) return null
    let iv = blob.slice(0, 16)
    let ct = blob.slice(16)
    let key = new Uint8Array(Convert.encodeUtf8(LiuManHua.aesKey))
    let out
    try {
      out = Convert.decryptAesCbc(ct, key, iv)
    } catch (e) {
      return null
    }
    let text = Convert.decodeUtf8(out)
    try {
      return JSON.parse(text)
    } catch (e) {
      return null
    }
  }
}
