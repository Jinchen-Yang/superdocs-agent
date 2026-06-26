import { createSkill } from '@mastra/core/skills';

export const examFinderSkill = createSkill({
  name: 'exam-finder',
  description: '找某门课的历年期中/期末试卷(test 类资料)时使用:按课程、学年学期、阶段(期中/期末)、是否含答案精确筛选。',
  instructions: `# 历年试卷检索

当用户提到"期末""期中""真题""历年卷"时:
1. 用 search_documents,设 type:"test",课程名放进 query(必要时也用 course 过滤)。
2. test 记录的 data.time 含 start/end(学年)、semester(First/Second)、stage(期中/期末);data.content 区分"原题"/"答案"。据此向用户澄清:哪一学年?要不要答案?
3. 命中后用 get_document 取学院/学期细节,再用 get_download_url 给下载链接。
4. 链接受限时,提示用 check_campus_ip 或 bupt_login(若已接入)。`,
});
