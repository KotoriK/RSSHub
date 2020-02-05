const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const dataPath = path.join(path.resolve('./'), 'tmp', 'virus_data.json');
const srcLink = 'https://3g.dxy.cn/newh5/view/pneumonia';
const HISTORY_PUSHES_MAX = 5;
const got = require('@/utils/got');
function getInner(str) {
    if (!str) {
        // console.error(`---start---\ngetInner fail.\n${str}\n---end---`);
        return;
    }
    if (str.substring(0, 3) === 'try') {
        const a = str.lastIndexOf('catch');
        const end = a - 1;
        const start = str.indexOf('=') + 1;
        return str.substring(start, end);
    }
}
function checkHanzi(str) {
    const hanziMatchResult = str.match(/[\u4E00-\u9FFF]+/g);
    if (hanziMatchResult) {
        return hanziMatchResult[0];
    } else {
        return;
    }
}
function addModifySign(num) {
    if (num === 0) {
        return `${num}`;
    }
    if (num > 0) {
        return `+${num}`;
    } else {
        return `${num}`;
    }
}
module.exports = async (ctx) => {
    // console.time("run time")
    // console.time("read")
    let StatisticsRaw, AreaStatRaw, PV, map;
    await (async function () {
        /* const page = await ctx.cache.tryGet(
            srcLink,
            async () => {
                const browser = await require('@/utils/puppeteer')();
                // 创建一个新的浏览器页面
                const page = await browser.newPage();
                // 访问指定的链接
                await page.goto(srcLink);
                // 渲染目标网页
                const r = {
                    map: await page.evaluate(
                        () =>
                            // 选取渲染后的 HTML
                            document.getElementsByTagName('canvas')[0].toDataURL()
                    ),
                    html: await page.evaluate(() => document.getElementsByTagName('body')[0].innerHTML)
                }
                return r;
            },
            300
        ); */
        /* const $ = cheerio.load(page.html); */
        const $ = cheerio.load(await ctx.cache.tryGet(
            srcLink,
            async () => {
                // console.log(srcLink);
                const response = await got({
                    method: 'get',
                    url: srcLink,
                });
                return response.data;
            },
            300
        ));
        StatisticsRaw = getInner($('script#getStatisticsService').html());
        AreaStatRaw = getInner($('script#getAreaStat').html());
        PV = getInner($('script#getPV').html());
        /* map = page.map; */
        
    })()


    // console.timeEnd("read")
    // console.log(Statistics);
    const items = [];
    if (StatisticsRaw && AreaStatRaw) {
        // 检查是否获取成功
        const Statistics = JSON.parse(StatisticsRaw),
            AreaStat = JSON.parse(AreaStatRaw);
map=Statistics.imgUrl
        const pubDate = new Date(
            (function (s) {
                if (!s.modifyime) {
                    // 处理打字错误
                    if (!s.modifyTime) {
                        return 0;
                    } else {
                        return s.modifyTime;
                    }
                } else {
                    s.modifyTime = s.modifyime;
                    return s.modifyime;
                }
            })(Statistics)
        );
        let historyPushes=[];
        // console.time("readFile")
        const oldData = (function (dataPath, newestDate) {
            if (!fs.existsSync(path.dirname(dataPath))) {
                fs.mkdirSync(path.dirname(dataPath));
            } // 创建tmp目录
            if (!fs.existsSync(dataPath)) {
                fs.writeFileSync(dataPath, '');
            }
            const file = fs.readFileSync(dataPath).toString(), defaultRe={ Statistics, AreaStat };
            if (file) {
                const historyData = JSON.parse(file);
                if(!historyData){
                    return defaultRe;
                }
                    historyPushes = historyData[2] ? (historyData[2].historyPushes?historyData[2].historyPushes:[]) : [];
                    const hDataDate = [new Date(historyData[0].Statistics.modifyTime), new Date(historyData[1].Statistics.modifyTime)];
                    if (hDataDate[1] < newestDate) {
                        return historyData[1];
                    } else {
                        if (hDataDate[0] < newestDate) {
                            return historyData[0];
                        } else {
                            return defaultRe;
                        }
                    }
                
            } else {
                return defaultRe;
            }
        })(dataPath, pubDate);
        // console.timeEnd('readFile')
        if (!oldData.Statistics) {
            oldData.Statistics = Statistics;
        }
        if (!oldData.AreaStat) {
            oldData.AreaStat = AreaStat;
        }

        const addUpdatedSign = function (dataStr) {
            if (!Statistics[dataStr]) {
                return '';
            } // 空数据处理
            if (Statistics[dataStr] === oldData.Statistics[dataStr]) {
                return Statistics[dataStr];
            } else {
                return Statistics[dataStr] + '   [有更新!]';
            }
        };

        const countAnalyze = function (raw) {
            // 全国 确诊 544 例 疑似 137 例 治愈 28 例 死亡 17 例
            // 全国：确诊 ([0-9]+) 例 疑似 ([0-9]+) 例 治愈 ([0-9]+) 例 死亡 ([0-9]+) 例
            const a = /([\u4E00-\u9FFF]+)([ 0-9]+)例[ ,，\n]([\u4E00-\u9FFF]+)([ 0-9]+)例[ ,，\n]([\u4E00-\u9FFF]+)([ 0-9]+)例[ ,，\n]([\u4E00-\u9FFF]+)([ 0-9]+)例[ ,，\n]([\u4E00-\u9FFF]+)([ 0-9]+)例(.{0,})/g.exec(raw);
            return a
                ? (function (a) {
                    let res = { unknown: a[11] };
                    res[a[1]] = a[2].trim()
                    res[a[3]] = a[4].trim()
                    res[a[5]] = a[6].trim()
                    res[a[7]] = a[8].trim()
                    res[a[9]] = a[10].trim()
                    return res;
                })(a)
                : -1;
        };
        if(Statistics.countRemark==='' ||!Statistics.countRemark){
            Statistics.countRemark=`确诊${Statistics.confirmedCount}例 疑似${Statistics.suspectedCount}例 重症${Statistics.seriousCount}例 治愈${Statistics.curedCount}例 死亡${Statistics.deadCount}例`;
        }
        Statistics._count = countAnalyze(Statistics.countRemark);
        historyPushes = historyPushes.filter((value) => { return value; })//去空
        historyPushes.sort((a, b) => { return new Date(b.pubDate) - new Date(a.pubDate); })
        historyPushes = historyPushes.filter((value) => {
            return value.pubDate !== pubDate.toUTCString();
        })
        if (historyPushes.unshift(
            {
                title: `新型冠状病毒简报 (${pubDate.toLocaleString()})`, // 文章标题
                description: `<pre>本次更新时间:${pubDate.toLocaleString()}  距离上次更新:${(function (oldTime, newTime) {
                    const ta = ((newTime - oldTime) / 60000).toString().split('.');
                    return `${ta[0]}分钟${ta[1] ? parseInt(`.${ta[1]}` * 60) + '秒' : ''}`;
                })(new Date(oldData.Statistics.modifyTime), pubDate)}
                ${//marquee
                    (function(Statistics){
                        if(Statistics.marquee){
                            if(Statistics.marquee.length&&Statistics.marquee.length!=0){
                                let str='<br>',strs=Statistics.marquee.map((value)=>{
                                    return `${value.marqueeLabel}:${value.marqueeContent}`
                                })
                                for(const i of strs){
                                    str+=`${i}<br>`
                                }
                                return str.slice(0,str.length-4);
                            }else{
                                return ''
                            }
                        }else{
                            return ''
                        }
                    })(Statistics)}
                ${Statistics['summary'] === '' ? '' : `<br>${addUpdatedSign('summary')}`}
                <br>${Statistics.countRemark}
                <br>${(function (oldData, newDataC, countAnalyze) {
                        if (!oldData._count) {
                            oldData._count = countAnalyze(oldData.Statistics.countRemark);
                        }
                        if (newDataC === -1) {
                            return '(!数据格式有更新!)';
                        }
                        if (oldData._count === -1) {
                            return '';
                        }
                        const oldDataC = oldData._count, _STR = '较上次更新:';
                        let str = _STR;
                        for (const i in newDataC) {
                            const t = newDataC[i] - oldDataC[i];
                            if (t !== 0) {
                                str += `${i}:${addModifySign(t)} `;
                            }
                        }
                        if (str === _STR) {
                            return '';
                        } else {
                            return str;
                        }
                    })(oldData, Statistics._count, countAnalyze)}
                    <br>较昨日增加： 确诊${Statistics.confirmedIncr}例 
                    疑似${Statistics.suspectedIncr}例 
                    重症${Statistics.seriousIncr}例
                    治愈${Statistics.curedIncr}例 
                    死亡${Statistics.deadIncr}例
                ${(function (Statistics, addUpdatedSign) {
                        // 兼容未来可能添加的注记
                        let i = 1,
                            str = '';
                        while (!(Statistics[`remark${i}`] === undefined || Statistics[`remark${i}`] === '')) {
                            str += '<br>' + addUpdatedSign(`remark${i}`);
                            i++;
                        }
                        return str;
                    })(Statistics, addUpdatedSign)}
                    ${(function (Statistics, addUpdatedSign) {
                        // 兼容未来可能添加的注记
                        let i = 1,
                            str = '';
                        while (!(Statistics[`note${i}`] === undefined || Statistics[`note${i}`] === '')) {
                            str += '<br>' + addUpdatedSign(`note${i}`);
                            i++;
                        }
                        return str;
                    })(Statistics, addUpdatedSign)}
                <br>${addUpdatedSign('generalRemark')}
                ${Statistics.abroadRemark?'<br>'+addUpdatedSign('abroadRemark'):''}
                ${(function (dataProvince, oldDataProvince) {
                        // 处理传入参数
                        let subscribedProvinces = ctx.params.province;
                        if (subscribedProvinces) {
                            subscribedProvinces = subscribedProvinces.split('|');
                            let str = '<br> 关注的省份情况:';
                            const now = {},
                                old = {};
                            const convertFromCount = function (obj) {
                                return {
                                    确认: parseInt(obj.confirmedCount),
                                    疑似: parseInt(obj.suspectedCount),
                                    治愈: parseInt(obj.curedCount),
                                    死亡: parseInt(obj.deadCount),
                                    unknown: obj.comment,
                                };
                            };
                            for (const item in subscribedProvinces) {
                                const resultHanzi = checkHanzi(subscribedProvinces[item]);
                                if (resultHanzi) {
                                    subscribedProvinces[item] = resultHanzi;
                                } else {
                                    break;
                                }
                                const funcFilter = function (value) { return subscribedProvinces[item] === value.provinceShortName };
                                now[subscribedProvinces[item]] = convertFromCount(dataProvince.filter(funcFilter)[0]);
                                old[subscribedProvinces[item]] = convertFromCount(oldDataProvince.filter(funcFilter)[0]);
                                // 检查now[subscribedProvinces[item]]是否为空
                                if (now[subscribedProvinces[item]]) {
                                    const nowDataProccessed = now[subscribedProvinces[item]],
                                        oldDataProccessed = old[subscribedProvinces[item]],
                                        differ = {},
                                        strArray = [];
                                    for (const dataName in nowDataProccessed) {
                                        if (dataName !== 'unknown') {
                                            differ[dataName] = nowDataProccessed[dataName] - oldDataProccessed[dataName];
                                            strArray.push(`${dataName}:${nowDataProccessed[dataName]}${differ[dataName] === 0 ? '' : `(${addModifySign(differ[dataName])})`} 例`);
                                        }
                                    }
                                    if (nowDataProccessed.unknown) {
                                        strArray.push(`(${nowDataProccessed.unknown})`);
                                    }
                                    str += `<br> ${subscribedProvinces[item]}: ${strArray.join('，')}`;
                                } else {
                                    str += `<br> ${subscribedProvinces[item]}：无数据。`;
                                }
                            }
                            return str;
                        } else {
                            return '';
                        }
                    })(AreaStat, oldData.AreaStat)}
                </pre>
                <br>正有${(function (PV) {
                        if (PV) {
                            let strArray1 = [], strArray2 = [], trimmed = PV.trim();
                            for (const c of trimmed) {
                                strArray1.push(c);
                            }
                            strArray1.reverse();
                            let _count = 1;
                            for (const c of strArray1) {
                                strArray2.push(c);
                                if (_count === 3) {
                                    strArray2.push(',')
                                    _count = 1;
                                } else {
                                    _count++;
                                }
                            }
                            if (strArray2[strArray2.length - 1] === ',') {
                                strArray2.pop()
                            }
                            let str = '';
                            strArray2.reverse()
                            for (const c of strArray2) {
                                str += c;
                            }
                            return str;
                        }
                    })(PV)}人一同关注。
                <br>疫情发展情况:
                ${/**<img src=${map} referrerpolicy="no-referrer">*/''}
                ${(function (pic){
                        return pic.map((value)=>{
                            return `<img src=${value} referrerpolicy="no-referrer">`
                        }).join('')
                })(Statistics.dailyPics?Statistics.dailyPics:[Statistics.dailyPic])/**兼容数组与非数组*/}`,
                pubDate: pubDate.toUTCString(),
                guid: `brief${pubDate.getTime()}`,
                link: srcLink,
            }) > HISTORY_PUSHES_MAX) {
            do { historyPushes.pop(); }
            while (historyPushes.length > HISTORY_PUSHES_MAX);
        };
        for (const i of historyPushes) {
            items.push(i);
        }
        //去除省部分
        historyPushes[0].description.replace(/(<br> 关注的省份情况:[\S\f\n ]{1,}<\/pre>)/, '</pre>');
        // 覆写
        fs.writeFile(
            dataPath,
            JSON.stringify([
                {
                    Statistics: oldData.Statistics,
                    AreaStat: oldData.AreaStat,
                },
                {
                    Statistics: Statistics,
                    AreaStat: AreaStat,
                },
                {
                    historyPushes: historyPushes
                }
            ]),
            function (err) {
                if (err) {
                    // console.error(err);
                }
            }
        );
    } else {
        items.push({
            title: '错误:解析失败',
            author: '',
            category: '',
            description: '',
            pubDate: Date.now().toString(),
            guid: 'err' + Date.now().toString(),
            link: srcLink,
        });
    }
    ctx.state.data = {
        title: '新型冠状病毒疫情概况(数据源:丁香医生)',
        link: srcLink,
        item: items,
    };
    // console.timeEnd('run time')
};
