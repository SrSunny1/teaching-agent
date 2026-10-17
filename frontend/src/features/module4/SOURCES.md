# Module 4 image sources

## Supplementary knowledge (2026-10-15)

Seven short paraphrased factual entries are in `knowledge.ts`; each entry links
to its source and maps to local case IDs. Classroom questions and discussion
prompts are editorial drafts, not quotations or approved answers. No complete
web articles or additional source images were copied. References:

- Cambridge, H. K. D. H. Bhadeshia: https://www.phase-trans.msm.cam.ac.uk/2008/Steel_Microstructure/SM.html
- Cambridge, Miguel Angel Yescas-Gonzalez and H. K. D. H. Bhadeshia: https://www.phase-trans.msm.cam.ac.uk/2001/adi/cast.iron.html
- Universidad Complutense Madrid: https://www.ucm.es/metallographicatlas/cast_irons (source marked CC BY-NC-SA 4.0)
- Struers: https://www.struers.com/en/Knowledge/Materials/Stainless-Steel

These summaries remain separate from course text and the shared backend index.
The observation discussion action passes relevant summaries and source URLs as
unreviewed user context, not system instructions. Images are not transmitted.
Teacher review, exact course citations and image-region labels remain pending.

## Image inventory

Retrieved 2026-10-15. Original image bytes are stored in `assets/`, without edits.
All examples are external supplementary material, pending teacher review. They
are not course ground truth, segmentation labels, or quantitative measurements.
The case names and source metadata do not certify a particular region in an image.

| Local file | Author | Selected license | Source |
| --- | --- | --- | --- |
| c35.jpg | Eisenbeisser | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:C35_ferrit_perlit.jpg |
| pearlite-sem.jpg | Michelshock | Public domain dedication by author | https://commons.wikimedia.org/wiki/File:Pearlite.jpg |
| austenite.jpg | Melancholia~itwiki | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:AISI_304_-_austenitic_structure.jpg |
| gray.jpg | Remux | CC BY-SA 4.0 (one of the offered licenses) | https://commons.wikimedia.org/wiki/File:Fundici%C3%B3n_gris_tipo_A.JPG |
| ductile.jpg | Perlit86 | CC BY 4.0 | https://commons.wikimedia.org/wiki/File:Cast_iron_ductile.jpg |
| malleable.jpg | Perlit86 | CC BY 4.0 | https://commons.wikimedia.org/wiki/File:Cast_iron_malleable.jpg |
| white.jpg | Perlit86 | CC BY 4.0 | https://commons.wikimedia.org/wiki/File:Cast_iron_white.jpg |

License links: https://creativecommons.org/licenses/by/4.0/ and
https://creativecommons.org/licenses/by-sa/4.0/ . Preserve credit, source and
license links, and indicate modifications. Adaptations of BY-SA images must
follow the applicable share-alike terms. Image licenses are separate from code.

The SEM image must not be presented as optical microscopy. Unknown specimen
conditions and calibration are deliberately left unknown. Source magnifications
do not establish a screen pixel-to-micrometre conversion.

The Cambridge reference is linked only; its images are not bundled:
https://www.phase-trans.msm.cam.ac.uk/2008/Steel_Microstructure/SM.html

Brass is deferred because source processing descriptions conflict. No network
images have been added to the backend knowledge base. Agent requests contain
the observation text and source metadata, not image pixels.
# 2026-10-16 第二批：新增10个材料/组织状态案例

所有文件均下载Commons所提供的原始版本，本项目未裁剪、改绘或AI增强。原作者、历史版本调整者和许可同时保存在 `additionalCases.ts` 并显示在图片下方。图片许可独立于项目代码许可。

| 本地文件 | 作者 | 许可 | Commons文件名 |
| --- | --- | --- | --- |
| ferritic.jpg | Eisenbeisser | CC BY-SA 3.0 | Ferritgefüge.JPG |
| primary-cementite.jpg | Eisenbeisser | CC BY-SA 3.0 | Primaerzementit.jpg |
| ledeburite.jpg | Eisenbeisser | CC BY-SA 3.0 | Ledeburit2.jpg |
| bainite.jpg | H K D H Bhadeshia | CC BY 4.0 | Bainite TEM.jpg |
| martensitic-420.jpg | Cristiano José Scheuera; Rodrigo Perito Cardosoa; Silvio Francisco Brunattoa | CC BY 4.0 | Microstructure of martensitic stainless steel AISI 420.jpg |
| ferritic-430.jpg | Sérgio Souto Maior Tavares; Luis Felipe Guimarães de Souza; Tatiane de Campos Chuvas; Cássio Lapate da Costa Machado; Brígida Bastos de Almeida | CC BY 4.0 | Microstructure of AISI 430 cooled in air after heating to 950 deg C.jpg |
| duplex.jpg | Tiago Felipe de Abreu Santosa; Edwar Andrés Torres Lópezd; Eduardo Bertoni da Fonsecaa; Antonio Jose Ramireza; Commons上传者裁切 | CC BY 4.0 | Microstructure of duplex stainless steel S32205.jpg |
| copper-dendrite.jpg | Andrew Egorov | CC BY-SA 4.0 | Микроструктура меди 2 (microstructure of copper).jpg |
| tin-bronze.jpg | Heycock and Neville, Philosophical Transactions; Encyclopaedia Britannica (1911) | Public domain | Britannica Alloys Plate Figure 01.jpg |
| al-bronze.png | Eisenbeisser; Unibond（Commons版本调整） | CC BY-SA 3.0 | AlubronzeCuAl20v500.png |

原页地址：`https://commons.wikimedia.org/wiki/File:` 加表中完整文件名；前端来源链接进行URL编码。许可：[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)、[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)、[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)。公共领域历史图的状态见其原页。

教学选题依据及边界：
- 南京工业大学《铁碳合金平衡组织观察》支持铁素体、一次渗碳体与莱氏体的观察主题；《常用耐腐蚀金属材料的显微组织分析》列出铁素体和双相不锈钢。具体开放图片不是该校试样。
- 西北工业大学大纲列出不平衡组织分析和铜类耗材，但未将这张铜枝晶照片与具体实验对应。
- 燕山大学《有色合金的显微组织观察》概述提及锡青铜、铝青铜，实际重点是黄铜；本次两类青铜作为课程主题拓展，不宣称学校实际观察了这两个试样。
- 贝氏体参照剑桥大学钢组织教学资料；420图片为论文样品内部的拓展图，不代替碳钢淬火实验。
- 原始大学链接及各例适用范围保存在 `teachingSources` 和课程资料引用中，不恢复高校分类页面。

430图303×204像素、锡青铜历史图280×176像素，仅作定性形貌示例。贝氏体为TEM，不能冒充光学金相图。新增内容未进入后端知识库或自动评分；自由观察和资料对比可用，问答固定数据集不因此宣称获得新的回答能力。

# 2026-10-16 图像扩充

新增原图未裁剪或改绘：spheroid.jpg，Eduard Pleshakov，Public domain，https://commons.wikimedia.org/wiki/File:PearliteSph3.jpg ；alsi.png，Djegan，CC BY-SA 3.0，https://commons.wikimedia.org/wiki/File:Al-Si_Microstructure.png ；al6061.png，Bob Clemintime，CC BY-SA 4.0，https://commons.wikimedia.org/wiki/File:6061_Aluminum_Grain_Boundaries.png ；brass.jpg，Strangerhahaha，Public domain，https://commons.wikimedia.org/wiki/File:Microstructure_of_rolled_and_annealed_brass;_magnification_400X.jpg 。

许可链接：https://creativecommons.org/licenses/by-sa/3.0/ 与 https://creativecommons.org/licenses/by-sa/4.0/ 。黄铜仅用于形貌观察，标题与上传历史的处理状态冲突，不用于工艺或相组成结论。新增图不是高校目录条目的替代图，也不代表所有组织已经收齐。
