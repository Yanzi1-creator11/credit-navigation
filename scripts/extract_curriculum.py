import json
import re
import sys
from pathlib import Path
from pypdf import PdfReader

source = Path(sys.argv[1])
output = Path(sys.argv[2])
reader = PdfReader(str(source))
pages = [(p.extract_text() or '').replace('\u2002', ' ') for p in reader.pages]

course_catalog = {}
course_re = re.compile(r'^\s*(.{2,46}?)\s+([A-Z][A-Z0-9]{7,14})\s+(\d+(?:\.\d+)?)\s+([^\n]+?)\s*$', re.M)
for page_no, text in enumerate(pages, 1):
    for name, code, credit, tail in course_re.findall(text):
        name = re.sub(r'\s+', ' ', name).strip(' /')
        if any(x in name for x in ('课程名称', '课程模块', '课程类别')):
            continue
        item = {'name': name, 'code': code, 'credits': float(credit), 'term': tail.strip(), 'page': page_no}
        key = re.sub(r'\s+', '', name)
        current = course_catalog.get(key)
        if not current or len(item['name']) < len(current['name']):
            course_catalog[key] = item

starts = []
major_re = re.compile(r'(?:^|\n)([^\n]{1,38}专业(?:（[^\n]{1,28}方向）)?)\s*\n?（一）培养目标')
for idx, text in enumerate(pages):
    match = major_re.search(text)
    if match and idx < 540:
        starts.append((idx, re.sub(r'\s+', '', match.group(1))))

majors = []
for pos, (start, name) in enumerate(starts):
    end = starts[pos + 1][0] if pos + 1 < len(starts) else min(start + 8, 540)
    block = '\n'.join(pages[start:min(end, start + 7)])
    total_match = re.search(r'总学分\s*(\d+)\s*学分', block)
    degree_totals = re.search(r'总学分\s*(\d+)（理学）\s*(\d+)（工学）', block)
    explicit_names = []
    mentions = []
    for found in re.finditer(r'《([^》]+)》', block):
        raw = found.group(1)
        clean = re.sub(r'\s+', '', re.sub(r'^\d+\s*', '', raw)).strip()
        if not clean or any(x in clean for x in ('培养方案', '管理办法', '认定方案')):
            continue
        context = re.sub(r'\s+', ' ', block[max(0, found.start()-70):min(len(block), found.end()+70)]).strip()
        if re.search(r'任选|选修|选择|至少|不重复', context):
            kind = 'option'
        elif re.search(r'必修|完成', context):
            kind = 'required'
        else:
            kind = 'mentioned'
        if clean not in explicit_names:
            explicit_names.append(clean)
            mentions.append((clean, kind, context))
    required = []
    for course_name, kind, context in mentions:
        exact = course_catalog.get(re.sub(r'\s+', '', course_name))
        if exact:
            required.append({**exact, 'match': 'exact', 'requirementType': kind, 'context': context})
        else:
            candidates = [v for k, v in course_catalog.items() if course_name in k or k in course_name]
            if len(candidates) == 1:
                required.append({**candidates[0], 'nameInRequirement': course_name, 'match': 'normalized', 'requirementType': kind, 'context': context})
            else:
                required.append({'name': course_name, 'code': None, 'credits': None, 'term': None, 'page': start + 1, 'match': 'unresolved', 'requirementType': kind, 'context': context})
    module_rules = []
    for line in block.splitlines():
        compact = re.sub(r'\s+', ' ', line).strip()
        if ('学分' in compact or '必修' in compact) and any(k in compact for k in ('完成', '选修', '必修', '任选', '至少')):
            if 8 <= len(compact) <= 180 and compact not in module_rules:
                module_rules.append(compact)
    majors.append({
        'id': re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-') or f'major-{start+1}',
        'name': name,
        'totalCredits': int(total_match.group(1)) if total_match else (int(degree_totals.group(1)) if degree_totals else None),
        'degreeOptions': ({'理学': int(degree_totals.group(1)), '工学': int(degree_totals.group(2))} if degree_totals else None),
        'sourcePages': [start + 1, min(end, start + 7)],
        'explicitRequiredCourses': required,
        'rules': module_rules[:28],
        'verification': 'machine-extracted-needs-review'
    })

payload = {
    'source': source.name,
    'grade': 2024,
    'majorCount': len(majors),
    'catalogCourseCount': len(course_catalog),
    'majors': majors,
}
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'majors': len(majors), 'courses': len(course_catalog), 'output': str(output)}, ensure_ascii=False))
