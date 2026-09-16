'use client';

import { useMemo, useState } from 'react';
import curriculum from './data/curriculum.json';
import './refinement.css';
import { AlignmentType, Document, HeadingLevel, LevelFormat, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';

type Course = {
  name: string; code: string | null; credits: number | null; term: string | null;
  page: number; match: string; requirementType: 'required' | 'option' | 'mentioned'; context: string;
};
type Major = {
  id: string; name: string; totalCredits: number | null; degreeOptions: Record<string, number> | null;
  sourcePages: number[]; explicitRequiredCourses: Course[]; rules: string[]; verification: string;
};
type Grade = { name: string; code: string; category: string; credits: number; grade: string; flag: string };

const majors = curriculum.majors as Major[];
const normalize = (v: string) => v.replace(/[\s·•()（）ⅠⅡⅢⅣⅤ《》]/g, '').toLowerCase();
const sportOptions = [
  ['田径','BCPEQD0012'],['体质健康','BCPEQD0019'],['啦啦操','BCPEQD0024'],['瑜伽','BCPEQD0010'],
  ['体育舞蹈','BCPEQD0013'],['健美','BCPEQD0016'],['中华韵','BCPEQD0017'],['养生','BCPEQD0023'],
  ['太极剑','BCPEQD0020'],['足球','BCPEQD0005'],['排球','BCPEQD0006'],['乒乓球','BCPEQD0007'],
  ['网球','BCPEQD0008'],['羽毛球','BCPEQD0015'],['高尔夫','BCPEQD0021'],['棒垒球','BCPEQD0025'],
  ['散打','BCPEQD0011'],['跆拳道','BCPEQD0022'],['拓展训练','BCPEQD0014'],['篮球裁判','BCPEQD0018'],
  ['田径理论与裁判法实验','BCPEQD0026']
].map(([name, code]) => ({name, code, credits: 1, term: '1、2、3、4'}));

const statisticsCore: Course[] = [
  ['数学分析Ⅲ','BBSMMSB005',5,'3'],['概率论','BPTMMSB001',4,'3'],['数理统计','BPTMMSB002S',3,'4'],
  ['实变函数','BBSMMS0007',3,'4'],['多元统计分析','BPTMMS0001',3,'5、6'],['时间序列分析','BPTMMS0002',3,'6']
].map(([name,code,credits,term]) => ({name:String(name),code:String(code),credits:Number(credits),term:String(term),page:342,match:'statistics-core',requirementType:'required',context:'统计学专业核心课'}));

function parseTranscript(text: string): Grade[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const table = lines.map(line => line.split(delimiter).map(x => x.trim()));
  const header = table[0];
  const find = (...names: string[]) => header.findIndex(h => names.some(n => h.includes(n)));
  const ix = {
    name: find('课程名称', '课程名'), code: find('课程编码', '课程代码'), category: find('课程类别', '课程性质'),
    credits: find('学分'), grade: find('最终成绩', '总评成绩', '成绩'), flag: find('成绩标志', '备注')
  };
  if (ix.name < 0 || ix.credits < 0) return [];
  const seen = new Map<string, Grade>();
  table.slice(1).forEach(row => {
    const item: Grade = {
      name: row[ix.name] || '', code: ix.code >= 0 ? row[ix.code] || '' : '',
      category: ix.category >= 0 ? row[ix.category] || '' : '', credits: Number(row[ix.credits]) || 0,
      grade: ix.grade >= 0 ? row[ix.grade] || '' : '', flag: ix.flag >= 0 ? row[ix.flag] || '' : ''
    };
    if (!item.name || !item.credits || /无效/.test(item.flag) || /缓考/.test(item.flag) || /^(F|不及格|未通过)$/.test(item.grade) || /^\d+(\.\d+)?$/.test(item.grade) && Number(item.grade) < 60) return;
    const key = item.code || normalize(item.name);
    const old = seen.get(key);
    if (!old || /补考/.test(item.flag)) seen.set(key, item);
  });
  return [...seen.values()];
}

export default function Home() {
  const [majorId, setMajorId] = useState('major-46');
  const [degree, setDegree] = useState('');
  const [text, setText] = useState('');
  const [analyzed, setAnalyzed] = useState(false);
  const [courseView, setCourseView] = useState<'map' | 'completed' | 'required' | 'options'>('map');
  const major = majors.find(m => m.id === majorId) || majors[0];
  const grades = useMemo(() => parseTranscript(text), [text]);
  const totalTarget = degree && major.degreeOptions?.[degree] ? major.degreeOptions[degree] : major.totalCredits || 0;
  const transcriptCredits = grades.reduce((sum, row) => sum + row.credits, 0);
  const hasCourse = (course: Course) => grades.some(g => Boolean(course.code && g.code === course.code) || normalize(g.name) === normalize(course.name));
  const majorCourses = major.name === '统计学专业' ? [...major.explicitRequiredCourses, ...statisticsCore] : major.explicitRequiredCourses;
  const validCourses = majorCourses.filter((c, i, list) => c.code && c.credits && !/培养方案|管理办法|认定方案/.test(c.name) && list.findIndex(x => x.code === c.code) === i);
  const isCommonCourse = (g: Grade) => /思想政治|通识|公共体育|公共外语|大学英语|军事|劳动|志愿服务|职业生涯|国际暑期/.test(g.category + g.name);
  const isCatalogMatch = (g: Grade) => validCourses.some(c => Boolean(c.code && g.code === c.code) || normalize(g.name) === normalize(c.name));
  const matchedGrades = grades.filter(g => isCommonCourse(g) || isCatalogMatch(g));
  const pendingGrades = grades.filter(g => !isCommonCourse(g) && !isCatalogMatch(g));
  const matchedCredits = matchedGrades.reduce((sum, row) => sum + row.credits, 0);
  const pendingCredits = pendingGrades.reduce((sum, row) => sum + row.credits, 0);
  const missingRequired = validCourses.filter(c => c.requirementType === 'required' && !hasCourse(c));
  const optionCourses = validCourses.filter(c => c.requirementType === 'option' && !hasCourse(c));
  const completedRequired = validCourses.filter(c => c.requirementType === 'required' && hasCourse(c));
  const nominalGap = Math.max(0, totalTarget - transcriptCredits);
  const progress = totalTarget ? Math.min(100, Math.round(transcriptCredits / totalTarget * 100)) : 0;
  const formatCredit = (n: number | null) => n == null ? '待核验' : `${n} 学分`;
  const peCredits = grades.filter(g => /公共体育/.test(g.category)).reduce((sum, g) => sum + g.credits, 0);
  const peGap = major.name === '哲学专业' ? Math.max(0, 4 - peCredits) : 0;
  const summerDone = grades.filter(g => /国际暑期|全英文/.test(g.name + g.category)).reduce((sum, g) => sum + g.credits, 0);
  const summerGap = major.name === '哲学专业' ? Math.max(0, 2 - summerDone) : 0;
  const requiredGapCredits = missingRequired.reduce((sum, c) => sum + (c.credits || 0), 0);
  const mapNodes = [
    ...(peGap ? [{label:'通识模块', title:'体育专项基础', amount:`${Math.ceil(peGap)} 门 · ${peGap} 学分`, note:'从专项基础课中选修；悬停查看可选项目', choices:sportOptions}] : []),
    ...(summerGap ? [{label:'通识模块', title:'国际暑期学校全英文课', amount:`至少 ${summerGap} 学分`, note:'具体课程以当年暑期学校开课表为准', choices:[]}] : []),
    ...(missingRequired.length ? [{label:'明确必修', title:'尚未完成的必修课程', amount:`${missingRequired.length} 门 · ${requiredGapCredits} 学分`, note:'按课程编码精确匹配', choices:missingRequired.map(c=>({name:c.name,code:c.code||'待核验',credits:c.credits||0,term:c.term||'以选课系统为准'}))}] : []),
    ...(optionCourses.length ? [{label:'限选模块', title:'按模块选够规定学分', amount:`${optionCourses.length} 门候选`, note:'这些不是全部都要修，悬停后按模块选择', choices:optionCourses.slice(0,24).map(c=>({name:c.name,code:c.code||'待核验',credits:c.credits||0,term:c.term||'以选课系统为准'}))}] : []),
    ...(nominalGap ? [{label:'总学分', title:'其他课程与实践环节', amount:`总量还差 ${nominalGap} 学分`, note:'这是总量缺口；还要另行满足必修、模块和实践要求', choices:[]}] : [])
  ];
  const downloadReport = async () => {
    const heading = (text: string) => new Paragraph({heading: HeadingLevel.HEADING_1, spacing:{before:260,after:120}, children:[new TextRun({text,color:'A00000',bold:true,font:'Microsoft YaHei'})]});
    const cell = (text: string, bold=false) => new TableCell({children:[new Paragraph({children:[new TextRun({text,bold,font:'Microsoft YaHei',size:20})]})]});
    const summary = new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:[
      new TableRow({children:[cell('检查项目',true),cell('当前结果',true),cell('说明',true)]}),
      new TableRow({children:[cell('成绩单有效学分'),cell(`${transcriptCredits} 学分`),cell(`已去重并排除不及格/无效成绩`)]}),
      new TableRow({children:[cell('已确认归属'),cell(`${matchedCredits} 学分`),cell(`其余 ${pendingCredits} 学分待学院确认模块归属，不从总进度中扣除`)]}),
      new TableRow({children:[cell('培养方案总学分'),cell(`${totalTarget} 学分`),cell(`${major.name}${degree?`（${degree}）`:''}`)]}),
      new TableRow({children:[cell('名义学分缺口'),cell(`${nominalGap} 学分`),cell('还需继续核对模块上限、实践认定与论文要求')]}),
      new TableRow({children:[cell('明确必修缺课'),cell(`${missingRequired.length} 门`),cell('仅统计能按课程名称或编码明确匹配的课程')]}),
    ]});
    const courseRows = [new TableRow({children:[cell('课程名称',true),cell('课程编码',true),cell('学分',true),cell('开课学期',true)]}),...missingRequired.map(c=>new TableRow({children:[cell(c.name),cell(c.code||'待核验'),cell(formatCredit(c.credits)),cell(c.term||'以选课系统为准')]}))];
    const children = [
      new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:120},children:[new TextRun({text:'学分修读检测报告',bold:true,size:36,color:'A00000',font:'Microsoft YaHei'})]}),
      new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:320},children:[new TextRun({text:`${major.name} · 2024级培养方案 · 生成日期 ${new Date().toLocaleDateString('zh-CN')}`,size:20,color:'6F625E',font:'Microsoft YaHei'})]}),
      heading('一、修读情况总览'), summary,
      new Paragraph({spacing:{before:160},children:[new TextRun({text:`成绩单有效学分为 ${transcriptCredits}，与${major.name}总学分要求相比，总量上还差 ${nominalGap} 学分。其中 ${matchedCredits} 学分已确认归属，${pendingCredits} 学分待确认所属模块；待确认学分不会被误删。`,font:'Microsoft YaHei',size:22})]}),
      heading('二、还需要修读的明确课程'),
      ...(missingRequired.length?[new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:courseRows})]:[new Paragraph({children:[new TextRun({text:'没有发现能够由系统唯一确认的必修课程缺口。',font:'Microsoft YaHei',size:22})]})]),
      heading('三、学分缺口地图'),
      ...mapNodes.map((node,i)=>new Paragraph({spacing:{after:100},children:[new TextRun({text:`${i+1}. ${node.title}：${node.amount}`,bold:true,color:'A00000',font:'Microsoft YaHei',size:22}),new TextRun({text:`\n${node.note}`,font:'Microsoft YaHei',size:20,color:'6F625E'})]})),
      heading('四、其他课程和实践环节怎么完成'),
      new Paragraph({children:[new TextRun({text:'这部分通常不是在普通选课页面里“选一门课”就结束，而是需要完成活动、提交材料并获得学院认定。建议按下面顺序处理：',font:'Microsoft YaHei',size:22})]}),
      ...['先向学院教务老师确认本专业尚缺的研究训练、实习、论文、劳动教育或志愿服务学分。','按照学院通知报名项目或实践活动，保留报名记录、过程材料和指导教师信息。','按要求完成报告、论文、服务时长或答辩，不要只完成活动而漏交认定材料。','在学分录入后再次下载本报告复核；尚未出现在成绩单中的项目仍会显示为待完成。'].map((t,i)=>new Paragraph({numbering:{reference:'steps',level:0},children:[new TextRun({text:t,font:'Microsoft YaHei',size:22})]})),
      heading('五、个性化修读建议'),
      ...missingRequired.slice(0,6).map(c=>new Paragraph({children:[new TextRun({text:`优先修读 ${c.name}（${c.code || '编码待核验'}，${formatCredit(c.credits)}）`,font:'Microsoft YaHei',size:22})]})),
      new Paragraph({spacing:{before:280},children:[new TextRun({text:'说明：本报告用于选课与学业规划，不替代学校教务处或学院的毕业资格审核。课程替代、跨专业认定和培养方案调整请以学院书面答复为准。',italics:true,color:'6F625E',font:'Microsoft YaHei',size:18})]})
    ];
    const doc = new Document({numbering:{config:[{reference:'steps',levels:[{level:0,format:LevelFormat.DECIMAL,text:'%1.',alignment:AlignmentType.START,style:{paragraph:{indent:{left:480,hanging:240}}}}]}]},styles:{default:{document:{run:{font:'Microsoft YaHei',size:22}}}},sections:[{properties:{page:{margin:{top:1000,right:1000,bottom:1000,left:1000}}},children}]});
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`${major.name}-学分检测报告.docx`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  };

  return <main>
    <header className="topbar">
      <div className="brand"><span className="seal">R</span><div><b>学分导航</b><small>2024级培养方案助手</small></div></div>
      <div className="source-note">依据 2024 级本科生培养方案 · 已索引 {curriculum.majorCount} 个专业</div>
    </header>

    <section className="universal-hero">
      <div className="intro-copy">
        <img className="hero-pigeon" src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/pigeon-guide.png`} alt="学分导航小鸽子" />
        <p className="eyebrow">DEGREE AUDIT · 2024</p>
        <h1>粘贴成绩单，<br/><em>看清毕业还差什么。</em></h1>
        <p className="lead">只看三件事：已修多少、还差多少、下学期选什么。</p>
      </div>
      <div className="audit-form">
        <label>你的专业
          <select value={majorId} onChange={e => { setMajorId(e.target.value); setDegree(''); setAnalyzed(false); }}>
            {majors.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        {major.degreeOptions && <label>学位方向
          <select value={degree} onChange={e => setDegree(e.target.value)}><option value="">请选择</option>{Object.keys(major.degreeOptions).map(x => <option key={x}>{x}</option>)}</select>
        </label>}
        <label>粘贴成绩单
          <textarea value={text} onChange={e => { setText(e.target.value); setAnalyzed(false); }} placeholder={'从教务系统或 Excel 复制后直接粘贴\n需要包含：课程名称、学分、最终成绩；有课程编码更准确'} />
        </label>
        <button className="primary-action" onClick={() => setAnalyzed(true)} disabled={!text.trim() || !totalTarget}>开始核验 <span>→</span></button>
        {text && !grades.length && <p className="form-error">没有识别到有效课程。请保留成绩表的表头一起粘贴。</p>}
        <p className="privacy">成绩只在当前浏览器中计算，不会上传或保存。</p>
      </div>
    </section>

    {!analyzed ? <section className="major-preview">
      <div><p className="eyebrow">SELECTED PROGRAM</p><h2>{major.name}</h2><p>培养方案 PDF 第 {major.sourcePages[0]}–{major.sourcePages[1]} 页</p></div>
      <div className="preview-number"><strong>{totalTarget || '—'}</strong><span>毕业总学分</span></div>
      <div className="preview-number"><strong>{validCourses.length}</strong><span>已关联编码的点名课程</span></div>
      <p className="preview-warning">先粘贴成绩单，系统才会生成个人缺课清单与修读顺序。</p>
    </section> : <>
      <section className="result-head">
        <div><p className="eyebrow">YOUR AUDIT</p><h2>{major.name}修读报告</h2><p>按当前所选专业重新计算</p></div>
        <div className="progress-ring" style={{'--p': `${progress * 3.6}deg`} as React.CSSProperties}><div><strong>{progress}%</strong><span>总学分</span></div></div>
      </section>

      <section className="stats-grid">
        <article><span>已修完有效学分</span><strong>{transcriptCredits}</strong><small>{grades.length} 门及格课程，已去重</small></article>
        <article><span>培养方案总学分</span><strong>{totalTarget}</strong><small>{degree ? `${degree}方向` : '正常毕业最低要求'}</small></article>
        <article><span>总量上还需学分</span><strong>{nominalGap}</strong><small>总学分要求 − 成绩单有效学分</small></article>
        <article><span>明确必修缺课</span><strong>{missingRequired.length}</strong><small>仅统计原文可明确定位编码的课程</small></article>
      </section>

      <section className="audit-detail">
        <div className="detail-heading"><div><p className="eyebrow">COURSE DECISION</p><h2>一眼看清已修与未修</h2></div><p>点标签看清单；悬停思维导图节点看课程编码。</p></div>
        <div className="detail-tabs">
          <button className={courseView === 'map' ? 'active' : ''} onClick={() => setCourseView('map')}>缺口思维导图</button>
          <button className={courseView === 'completed' ? 'active' : ''} onClick={() => setCourseView('completed')}>已修完 {grades.length}</button>
          <button className={courseView === 'required' ? 'active' : ''} onClick={() => setCourseView('required')}>必修缺课 {missingRequired.length}</button>
          <button className={courseView === 'options' ? 'active' : ''} onClick={() => setCourseView('options')}>模块候选 {optionCourses.length}</button>
        </div>
        {courseView === 'map' ? <div className="mind-map">
          <div className="map-root"><span>{major.name}</span><strong>还需完成</strong><b>{nominalGap} 学分</b></div>
          <div className="map-branches">{mapNodes.map((node, i) => <button type="button" className="map-node" key={`${node.title}-${i}`} aria-label={`${node.title}，${node.amount}`}>
            <span>{node.label}</span><strong>{node.title}</strong><b>{node.amount}</b><small>{node.note}</small>
            <div className="node-popover" role="tooltip"><h3>{node.title} · 可选课程</h3>{node.choices.length ? <div className="choice-list">{node.choices.map((c, j) => <div key={`${c.code}-${j}`}><div><b>{c.name}</b><code>{c.code}</code></div><span>{c.credits} 学分 · 第 {c.term} 学期</span></div>)}</div> : <p>该项目不能仅凭成绩单自动选定具体课程，请按当学期教务系统开课情况或学院认定完成。</p>}</div>
          </button>)}</div>
        </div> : <div className="course-table-wrap"><table className="course-table"><thead><tr><th>课程名称</th><th>课程编码</th><th>学分</th><th>开课学期</th><th>依据</th></tr></thead><tbody>
          {courseView === 'completed' ? grades.map((g, i) => <tr key={`${g.code}-${i}`}><td><b>{g.name}</b></td><td><code>{g.code || '按课程名匹配'}</code></td><td>{g.credits} 学分</td><td>{g.grade || '已通过'}</td><td>{isCatalogMatch(g) ? '专业课已确认' : isCommonCourse(g) ? '公共课已确认' : '待确认所属模块'}</td></tr>) : (courseView === 'required' ? missingRequired : optionCourses).map((c, i) => <tr key={`${c.code}-${i}`}><td><b>{c.name}</b></td><td><code>{c.code}</code></td><td>{formatCredit(c.credits)}</td><td>{c.term || '以选课系统为准'}</td><td>培养方案第 {c.page} 页</td></tr>)}
          {!(courseView === 'completed' ? grades : courseView === 'required' ? missingRequired : optionCourses).length && <tr><td colSpan={5} className="empty-row">暂无可确认课程。</td></tr>}
        </tbody></table></div>}
      </section>

      <section className="advice-section">
        <div><p className="eyebrow">PERSONAL PLAN</p><h2>个性化修读建议</h2></div>
        <ol>
          {missingRequired.slice().sort((a, b) => String(a.term).localeCompare(String(b.term))).slice(0, 5).map(c => <li key={c.code}><span>优先</span><div><b>{c.name}</b><p>{c.code} · {formatCredit(c.credits)} · 建议在第 {c.term || '合适'} 学期修读</p></div></li>)}
          {nominalGap > 0 && <li><span>补足</span><div><b>继续完成各限选模块与实践环节</b><p>名义上还差 {nominalGap} 学分；先完成必修，再从“模块候选”中按规则选课。</p></div></li>}
          <li><span>确认</span><div><b>向学院核对无法唯一映射的规则</b><p>跨专业选修、课程替代、实践认定和培养方案调整可能需要人工审批。</p></div></li>
        </ol>
        <aside><strong>已完成 {completedRequired.length} 门明确必修</strong><p>{pendingCredits} 学分暂待确认模块，但仍计入有效总学分。课程替代不会自动猜测。</p></aside>
      </section>

      <section className="practice-guide">
        <img src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/pigeon-guide.png`} alt="拿着学分清单的小鸽子助手" />
        <div className="practice-copy"><p className="eyebrow">PRACTICE GUIDE</p><h2>实践学分：4 步录入</h2><p>先确认，再报名，交材料，最后查成绩单。</p></div>
        <div className="practice-steps">
          {[['01','问学院','确认尚缺的实践项目。'],['02','按通知报名','只选学院认可的项目。'],['03','交材料','报告、答辩或时长证明要交齐。'],['04','查录入','成绩单出现学分才算完成。']].map(([n,t,d])=><div key={n}><span>{n}</span><b>{t}</b><p>{d}</p></div>)}
        </div>
      </section>

      <section className="report-download">
        <div><p className="eyebrow">WORD REPORT</p><h2>下载学分报告</h2><p>已修、未修、课程编码和下学期建议，一份 Word 说清。</p><button onClick={downloadReport}>生成 Word 报告 <span>↓</span></button></div>
        <img src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/pigeon-guide.png`} alt="帮助生成学分检测报告的小鸽子" />
      </section>
    </>}
    <footer>计算结果用于修读规划，不替代教务处与学院的毕业资格审核 · 培养方案数据来源：用户提供的 2024 级本科生培养方案</footer>
  </main>;
}
