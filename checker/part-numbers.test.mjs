// Checks that Snap-on part numbers get the right drawing, drive and size.
// Run: node checker/part-numbers.test.mjs
// Every number below is a real one from Snap-on's catalogs, with what the catalog says it is.
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8").split("\n");
const from = html.findIndex((l) => /^  const ART = \{/.test(l));
const to = html.findIndex((l, i) => i > from && /^  \/\/ Where each drawing's bottom edge/.test(l));
const { artOf } = new Function("state", "storeOf", html.slice(from, to).join("\n") + "\nreturn { artOf };")({ catalog: {} }, () => null);

// [part number, drawing, drive, size]  (drive/size left out = not checked)
const CASES = [
  ["BLPBSS40", "set", '1/4"'],
  // ratchets: the tooth count ends the number; L long, F/X flex, K/C stubby, H soft grip, 8xx round
  ["F80", "ratchet", '3/8"'], ["GF80", "ratchet", '3/8"'], ["FK80", "ratchet-stubby", '3/8"'], ["FL80", "ratchet-long", '3/8"'],
  ["FLF80", "ratchet-long-flex", '3/8"'], ["FX80", "ratchet-flex", '3/8"'], ["FBF80", "ratchet-flex"], ["FKF80", "ratchet-flex"],
  ["FH80", "ratchet-soft", '3/8"'], ["FHL80", "ratchet-long-soft"], ["FHF80", "ratchet-flex-soft"], ["FHLF80", "ratchet-long-flex-soft"],
  ["FC936", "ratchet-stubby"], ["FR936", "ratchet"], ["F936FOD", "ratchet"], ["F872", "ratchet-round"], ["FZ936A", "ratchet"],
  ["FHC737", "ratchet-round-soft"], ["F100", "ratchet", '3/8"'], ["T72", "ratchet", '1/4"'], ["TM72", "ratchet", '1/4"'],
  ["TL72", "ratchet-long"], ["THL72", "ratchet-long-soft"], ["TF72", "ratchet-flex"], ["THLF72", "ratchet-long-flex-soft"],
  ["TX72", "ratchet-flex"], ["T860", "ratchet-round"], ["TK860", "ratchet-round"], ["TMR860", "ratchet-round"], ["TS72", "ratchet-round", '1/4"'],
  ["S80", "ratchet", '1/2"'], ["S80A", "ratchet", '1/2"'], ["SH80", "ratchet-soft"], ["SL80", "ratchet-long"], ["SLF80", "ratchet-long-flex"],
  ["SHLF80", "ratchet-long-flex-soft", '1/2"'], ["SX80", "ratchet-flex"], ["SR936", "ratchet"], ["CSS949A", "ratchet", '1/2"'],
  ["L872", "ratchet-round", '3/4"'], ["BPRSR940", "ratchet", '1/2"'], ["BPRTR936", "ratchet", '1/4"'],
  ["TM72SET", "set-kit", '1/4"'],
  // breaker bars, speeders, extensions, u-joints, adapters
  ["SN18B", "breaker", '1/2"'], ["GSN18B", "breaker", '1/2"'], ["SN24C", "breaker"], ["SHBB24", "breaker"], ["CSN24B", "breaker"],
  ["THBB10", "breaker", '1/4"'], ["FHBB12A", "breaker", '3/8"'], ["F10LC", "breaker", '3/8"'], ["F12LA", "breaker", '3/8"'], ["TM10G", "breaker", '1/4"'],
  ["F4LB", "speeder", '3/8"'], ["F4LA", "speeder"], ["TMS4E", "speeder", '1/4"'], ["S4", "speeder", '1/2"'], ["SN4B", "speeder", '1/2"'],
  ["TMS70A", "speeder"], ["FRS70A", "speeder"],
  ["TMXK60", "extension", '1/4"', '6"'], ["TMXK110", "extension", '1/4"', '11"'], ["TMXKL60", "extension"], ["TMIXL62", "extension"],
  ["TMXWP4", "extension"], ["FX1", "extension", '3/8"', '1"'], ["FXK3", "extension", '3/8"', '3"'], ["FXK11", "extension", '3/8"', '11"'],
  ["FX24A", "extension", '3/8"', '24"'], ["FXKL6", "extension"], ["FXWK6", "extension"], ["GFXK6", "extension", '3/8"'], ["FX61A", "extension"],
  ["TM61A", "extension"], ["SX2", "extension", '1/2"'], ["SXK5", "extension", '1/2"', '5"'], ["SXWP8", "extension"], ["CSX10", "extension"], ["L62", "extension", '3/4"'],
  ["TMU8B", "ujoint", '1/4"'], ["FU8A", "ujoint", '3/8"'], ["PFU8A", "ujoint"], ["S8", "ujoint", '1/2"'], ["L82A", "ujoint", '3/4"'],
  ["TA3", "adapter"], ["GFAT1E", "adapter"], ["GSAF1E", "adapter"], ["GLA12B", "adapter"], ["FSD14", "adapter"], ["S77A", "adapter"], ["TM77", "adapter"],
  // sockets: 1/4" TM 6-pt, TMD 12-pt, TMM metric, STM deep, TMS semi-deep, TMU swivel
  ["TM8", "socket", '1/4"', '1/4"'], ["TM12", "socket", '1/4"', '3/8"'], ["TMD10", "socket-12", '1/4"', '5/16"'], ["TMM10", "socket", '1/4"', "10mm"],
  ["TMMD12", "socket-12", '1/4"', "12mm"], ["STM10", "socket-deep", '1/4"', '5/16"'], ["STMM14", "socket-deep", '1/4"', "14mm"], ["TMS14", "socket-deep", '1/4"', '7/16"'],
  ["TMMS12", "socket-deep"], ["TMU81B", "socket-swivel", '1/4"', '1/4"'], ["TMUSM5A", "socket-swivel", '1/4"', "5mm"], ["STMUM10A", "socket-swivel"],
  ["GTMD6", "socket-12", '1/4"', '3/16"'],
  // 3/8": F 12-pt, FS 6-pt, FM/FSM metric, SF/SFS deep, FSMS semi-deep, FU/FSU swivel
  ["F12", "socket-12", '3/8"', '3/8"'], ["F081", "socket-12", '3/8"', '1/4"'], ["FS121", "socket", '3/8"', '3/8"'], ["FS081", "socket", '3/8"', '1/4"'],
  ["FSM12", "socket", '3/8"', "12mm"], ["FSM101", "socket", '3/8"', "10mm"], ["FSM121", "socket", '3/8"', "12mm"], ["FM9", "socket-12", '3/8"', "9mm"],
  ["SF121", "socket-deep", '3/8"', '3/8"'], ["SFS121", "socket-deep", '3/8"', '3/8"'], ["SFSM10", "socket-deep", '3/8"', "10mm"], ["FSMS12", "socket-deep", '3/8"', "12mm"],
  ["FU10A", "socket-swivel", '3/8"', '5/16"'], ["FSUM10", "socket-swivel", '3/8"', "10mm"],
  // 1/2": TW 6-pt, SW 12-pt, TS 6-pt deep, S 12-pt deep, SU swivel
  ["TW181", "socket", '1/2"', '9/16"'], ["GTW261", "socket", '1/2"', '13/16"'], ["TW121A", "socket", '1/2"', '3/8"'], ["SW121A", "socket-12", '1/2"', '3/8"'],
  ["TS121A", "socket-deep", '1/2"', '3/8"'], ["S161A", "socket-deep", '1/2"', '1/2"'], ["TWM12A", "socket", '1/2"', "12mm"], ["SWM121A", "socket-12", '1/2"', "12mm"],
  ["TSM12A", "socket-deep", '1/2"', "12mm"], ["SM12B", "socket-deep", '1/2"', "12mm"], ["SU18", "socket-swivel", '1/2"', '9/16"'],
  // 3/4": LDH 12-pt, LS deep
  ["LDH242", "socket-12", '3/4"', '3/4"'], ["LDHM222", "socket-12", '3/4"', "22mm"], ["LS342", "socket-deep", '3/4"', '1-1/16"'],
  // impact: IMTM 1/4", IMF 3/8", IM/IMM 1/2" (trailing 2 = 3/4"), S... deep, IP swivel
  ["IMTM8A", "socket-impact", '1/4"', '1/4"'], ["IMTMM10", "socket-impact", '1/4"', "10mm"], ["SIMTM8", "socket-impact", '1/4"'], ["IPTMM8", "socket-swivel", '1/4"', "8mm"],
  ["IMF120A", "socket-impact", '3/8"', '3/8"'], ["IMFM14", "socket-impact", '3/8"', "14mm"], ["SIMFM8A", "socket-impact", '3/8"', "8mm"], ["IPF12C", "socket-swivel", '3/8"', '3/8"'],
  ["IPLFM12B", "socket-swivel", '3/8"', "12mm"], ["IM120A", "socket-impact", '1/2"', '3/8"'], ["IMD120A", "socket-impact", '1/2"'], ["SIM120A", "socket-impact", '1/2"'],
  ["IMM100A", "socket-impact", '1/2"', "10mm"], ["SIMM100A", "socket-impact", '1/2"', "10mm"], ["SIMMF14", "socket-impact", '1/2"', "14mm"], ["SIML160", "socket-impact", '1/2"', '1/2"'],
  ["IPL16C", "socket-swivel", '1/2"', '1/2"'], ["IPLM10C", "socket-swivel", '1/2"', "10mm"], ["SIP18A", "socket-swivel", '1/2"'], ["IPLM18B", "socket-swivel", '1/2"', "18mm"],
  ["IM182A", "socket-impact", '3/4"', '9/16"'], ["IMM172A", "socket-impact", '3/4"', "17mm"], ["SIM242", "socket-impact", '3/4"', '3/4"'],
  // bit, Torx, E-Torx, spark plug
  ["FTX40E", "socket-bit", '3/8"', "T40"], ["TTX25E", "socket-bit", '1/4"', "T25"], ["TTXL25E", "socket-bit"], ["FTXB27E", "socket-bit"],
  ["FA8E", "socket-bit", '3/8"', '1/4"'], ["FAM6E", "socket-bit", '3/8"', "6mm"], ["FAM6A", "socket-bit"], ["FABLM6E", "socket-bit", '3/8"', "6mm"],
  ["TMA8E", "socket-bit", '1/4"', '1/4"'], ["TMAM6E", "socket-bit", '1/4"', "6mm"], ["TMA2.5E", "socket-bit", '1/4"', '5/64"'], ["TMP22E", "socket-bit"], ["FBS8", "socket-bit"],
  ["TLE40A", "socket", '1/4"', "E4"], ["STLE50", "socket-deep", '1/4"', "E5"], ["FLE180A", "socket", '3/8"', "E18"], ["SLE160", "socket", '1/2"', "E16"],
  ["TSE80", "socket-swivel", '1/4"', "E8"], ["IMTLE40A", "socket-impact"], ["S9704KA", "socket-spark", '3/8"'],
  // socket sets: drive digit + piece count
  ["211SFSY", "set", '3/8"'], ["310IMMYA", "set", '1/2"'], ["110TMY", "set", '1/4"'], ["207EFAMY", "set-bit"], ["212EFTXY", "set-bit"],
  // wrenches
  ["OEX18", "wrench", null, '9/16"'], ["OEX12B", "wrench", null, '3/8"'], ["OEX080B", "wrench", null, '1/4"'], ["OEXM150B", "wrench", null, "15 mm"],
  ["SOEX12", "wrench", null, '3/8"'], ["SOEXM10", "wrench", null, "10 mm"], ["SOEXM100", "wrench", null, "10 mm"], ["GOEXM100B", "wrench", null, "10 mm"],
  ["OXI8B", "wrench", null, '1/4"'], ["OXIM55SB", "wrench", null, "5.5 mm"], ["OSH12B", "wrench"], ["OEXL12B", "wrench"], ["FHOM8B", "wrench", null, "8 mm"],
  ["SOEXR12", "wrench-ratchet", null, '3/8"'], ["SOEXRM8", "wrench-ratchet", null, "8 mm"], ["OEXRM10", "wrench-ratchet"], ["OXIR12", "wrench-ratchet"],
  ["BOER8", "wrench-ratchet"], ["BOERMF12A", "wrench-ratchet", null, "12 mm"], ["R1214C", "wrench-ratchet", null, "3/8 × 7/16"], ["RBM1011C", "wrench-ratchet", null, "10 × 11 mm"],
  ["BXOR1012", "wrench-ratchet"], ["XB1214A", "wrench-box", null, "3/8 × 7/16"], ["XBM1214A", "wrench-box", null, "12 × 14 mm"], ["XS67A", "wrench-box"], ["XO1012", "wrench-box"],
  ["XDHM1012", "wrench-box"], ["CX1012", "crowfoot"], ["VO810B", "wrench-open", null, "1/4 × 5/16"], ["DSM89", "wrench-open"], ["VS8B", "wrench-open", null, '1/4"'],
  ["RXH1214", "wrench-flare"], ["FAD8B", "wrench-adjust"],
  ["OEX710B", "set-wrench"], ["SOEXM710", "set-wrench"], ["OEXSM710B", "set-wrench"], ["OEX707B", "set-wrench"], ["OEXM725", "set-wrench"], ["XB605A", "set-wrench"], ["RB604C", "set-wrench"],
  // torque
  ["QD3R250A", "torque-click"], ["QJR3200", "torque-click"], ["TQFR250E", "torque-click"], ["ATECH3FR250", "torque"],
  // screwdrivers, nut drivers, hex keys
  ["SGD2BR", "screwdriver"], ["SGDP82BR", "screwdriver-phillips"], ["SHDP42IRR", "screwdriver-phillips"], ["SGDTX38BR", "screwdriver-torx"], ["SHDTX640O", "screwdriver-torx"],
  ["SSDMR4BO", "screwdriver-ratchet"], ["SGDMRC44B", "screwdriver-ratchet"], ["GSHDP31R", "screwdriver-phillips"], ["SGDX60BR", "set-screwdriver"], ["SHDXL80O", "set-screwdriver"],
  ["IHTS3", "insulated"], ["CNSGDP61", "insulated"], ["NDD108AR", "nutdriver"], ["NDLM610", "nutdriver"], ["AW1020DK", "hexkeys"], ["AWM110BHK", "hexkeys"],
  // pliers
  ["47ACF", "pliers"], ["47ACP", "pliers"], ["137ACP", "pliers"], ["HL138ACP", "pliers"], ["57AHLP", "pliers"], ["96CF", "pliers-needle"], ["97CCP", "pliers-needle"],
  ["911BCP", "pliers-needle"], ["87CF", "pliers-diag"], ["808ACP", "pliers-diag"], ["312CP", "pliers-diag"], ["PL400B", "set-pliers"], ["PL347ACFG", "set-pliers"],
  ["LP10WR", "pliers-locking"], ["AWPBX10", "pliers-pump"], ["SRPC9045A", "pliers-snap"],
  // hammers, punches, pry bars, picks
  ["HBFE24", "hammer-deadblow"], ["HBSE20", "hammer-deadblow"], ["HBBD32", "hammer-deadblow"], ["BP16B", "hammer-ballpeen"], ["BPN16B", "hammer-ballpeen"],
  ["BC7B", "hammer-sledge"], ["BD6ESG", "hammer-sledge"], ["HBPT16", "hammer-mallet"], ["HBR15", "hammer-mallet"],
  ["PPC3A", "punch-pin"], ["PPR4", "punch-pin"], ["PCSG812", "punch"], ["PPC250AK", "set-punch"], ["PPCSG710", "set-punch"],
  ["SPBS24", "pry"], ["SPBS704R", "pry"], ["PBMP12A", "pry"],
  ["SG4ASABR", "pick"], ["SGASA204C", "set-pick"], ["YA145A", "set-pick"], ["SGSR1", "seal-puller"],
  // shop: pickups, mirrors, knives, scrapers, files, saws, creepers, jacks, pullers, lights
  ["PT5C", "pickup"], ["PT28E", "pickup"], ["UPT35", "pickup"], ["PTM143", "mirror"], ["UIM225", "mirror"],
  ["PK100", "knife"], ["KER1440", "knife"], ["CSA12C", "scraper"], ["PKB50", "scraper"], ["8MA", "file"], ["10R", "file"], ["HS18A", "hacksaw"],
  ["JCW60BL", "creeper"], ["FJ200", "floor-jack"], ["CG240", "puller"], ["CJ83C", "puller"], ["ECFLED84", "shop"],
  // diagnostics and storage
  ["EEDM504F", "multimeter"], ["EEMS341", "diag-tablet"], ["EETH400", "diag-handheld"], ["KRA4107", "storage"], ["KRL1022", "storage"], ["KMP3415", "storage"], ["KRSC326", "storage-cart"],
  // cordless (14.4V: 7xx/8xx, 18V: 88xx/9xxx)
  ["CT861", "cl14-impact"], ["CT861DB", "cl14-impact"], ["CT825", "cl14-impact"], ["CTR814DB", "cl14-ratchet"], ["CTR867", "cl14-ratchet"], ["CTR761", "cl14-ratchet"], ["CTR881GMDB", "cl14-ratchet"],
  ["CTS861", "cl14-driver"], ["CDR861", "power-drill"], ["CTB8174", "cl14-battery"], ["CT9075", "cl18-impact"], ["CT8850", "cl18-impact"], ["CT9010", "cl18-impact"],
  ["CDR9015", "cl18-drill"], ["CTGR8850", "cl18-grinder"], ["CTGRS8825", "grinder-die"], ["CTRS8850", "cl18-saw"], ["CTB185", "cl18-battery"], ["CTB8185", "cl18-battery"],
  ["CTC772A", "charger"], ["CGRS861", "grinder-die"], ["CTPP861", "polisher"], ["CTLED861", "shop"], ["CTRG9050", "rivet"], ["CGG8850", "grease-gun"],
  // air
  ["FAR72A", "air-ratchet"], ["IM31", "air-impact"], ["IM6100", "air-impact"], ["MG725", "air-impact"], ["MG325", "air-impact"], ["PT850", "air-impact"], ["PT350", "air-impact"],
  ["PH3050", "air-hammer"], ["PTGR200", "grinder-die"],
  // added from the full catalog sweep (checker/catalog-part-numbers.tsv)
  ["T8", "socket", '1/4"', '1/4"'], ["L873", "ratchet", '1"'], ["L113H", "breaker", '1"'], ["L63", "extension", '1"'], ["IM62B", "extension", '1"'],
  ["IM72", "ujoint", '3/4"'], ["IP800", "ujoint", '1/2"'], ["IP80D", "ujoint", '1/2"'], ["GU8", "ujoint", '1/2"'], ["L672B", "adapter", '3/4"'],
  ["IMX52", "extension", '1/2"', '5"'], ["IMXL182", "extension", '1/2"', '18"'], ["IMSFXL24", "extension", '3/8"', '24"'], ["IMXA42", "adapter"],
  ["IMFS200", "socket-impact", '1/2"', '5/8"'], ["SIMM302", "socket-impact", '1/2"', "30mm"], ["IM243P", "other"],
  ["TTX25E2", "socket-bit", '3/8"', "T25"], ["TMA2E2", "socket-bit", '3/8"', '1/16"'], ["TMP21E2", "socket-bit", '3/8"'], ["FAM8E2", "socket-bit", '1/2"', "8mm"],
  ["STX60E2", "socket-bit", '1/2"', "T60"], ["SAM12LE", "socket-bit", '1/2"', "12mm"], ["SADM10E", "socket-bit", '1/2"'], ["STSM12E", "socket-bit", '1/2"', "12mm"],
  ["FTSM8E", "socket-bit", '3/8"', "8mm"], ["SP32E", "socket-bit", '1/2"'], ["SW28E2", "socket-bit", '1/2"'], ["FBSM8A", "socket-bit", '3/8"'],
  ["SW412", "socket-12", '1/2"', '3/8"'], ["SW161A", "socket-12", '1/2"', '1/2"'], ["MGMM5.5", "socket", '1/4"', "5.5mm"], ["TMUSM5.5A", "socket-swivel", '1/4"', "5.5mm"],
  ["A17", "socket", '1/2"'], ["A80A", "extractor"], ["BW626A", "socket", '3/4"'], ["WH280", "socket", '1/2"'], ["PP409A", "socket"],
  ["GSP936", "ratchet", '1/2"'], ["PALMRAT", "ratchet", '3/8"'], ["BTWOS", "ratchet-stubby"], ["LRS70A", "speeder", '1/2"'], ["TM62B", "speeder", '1/4"'],
  ["BLPSB12114", "socket", '1/2"', '1-1/4"'], ["BLPSM144.5", "socket", '1/4"', "4.5mm"], ["BLPEXTK126", "extension", '1/2"', '6"'], ["BLPEXTL1418", "extension", '1/4"', '18"'],
  ["BLPH14316", "socket-bit", '1/4"', '3/16"'], ["BLPTS1430", "socket-bit", '1/4"', "T30"], ["BLPUJ12", "ujoint", '1/2"'], ["BLPBB146", "breaker", '1/4"'], ["BLPSD14", "speeder", '1/4"'],
  ["R810C", "wrench-ratchet", null, "1/4 × 5/16"], ["RBM78SC", "wrench-ratchet", null, "7 × 8 mm"], ["RYAM910", "wrench-ratchet"], ["RTBM10", "wrench-ratchet", null, "10 mm"], ["RTB607", "set-wrench"],
  ["XBM1214SA", "wrench-box"], ["VSM5210B", "wrench-open", null, "10 mm"], ["VS814A", "set-wrench"], ["OXI709SBK", "set-wrench"], ["BLPCW516", "wrench", null, '5/16"'], ["BLPCWS711", "set-wrench"],
  ["96CF", "pliers-needle"], ["196CF", "pliers-needle"], ["411BCP", "pliers-needle"], ["912AEP", "pliers-needle"], ["91ACP", "pliers-pump"], ["47ACP", "pliers"], ["LP30A", "set-punch"],
  ["SGDTX50BR", "set-screwdriver"], ["SGDTX320BR", "screwdriver-torx"], ["SGDET70", "set-screwdriver"], ["GSHDX80R", "set-screwdriver"], ["SGDMRC103A", "set-screwdriver"],
  ["30SSD", "screwdriver"], ["120SSDP", "screwdriver-phillips"], ["SSM3", "screwdriver"], ["102NDL10", "nutdriver"], ["CSSC9", "insulated"],
  ["PPC808A", "punch"], ["PPC12B", "punch"], ["BPPC1878", "punch"], ["PPC714B", "punch-pin"], ["PPC104A", "punch-pin"], ["PPC710A", "set-punch"], ["PPB20AK", "set-punch"], ["1210B", "punch-pin"],
  ["1250", "pry"], ["BP8B", "hammer-ballpeen"], ["HLE24", "hammer-deadblow"], ["HD4SG", "hammer-sledge"], ["5NHRA", "file"], ["SGHF614BR", "file"],
  ["PSLR4-1", "pick"], ["SGLASA204", "set-pick"], ["YA338", "pick"], ["GA294", "mirror"], ["GA265A", "pickup"], ["MS800", "scraper"], ["YA405A", "knife"], ["PIT160", "hand-impact"],
  // fadie's own box (2026-10-20): every number checked against Snap-on's listing
  ["OFCA1", "filter-wrench"], ["0FCA1KT", "filter-wrench"], ["206AFX", "set-extension", '3/8"'], ["305ASX", "set-extension", '1/2"'], ["207IPLFM", "set", '3/8"'],
  ["ADHWS10", "wrench-adjust"], ["ADHWS8O", "wrench-adjust"], ["ADWS8O", "wrench-adjust"], ["BLPBTWKIT", "set-kit", '1/4"'], ["BLPHSM1440", "socket-bit", '1/4"', "4mm"],
  ["C0100", "tool-bag"], ["PB206B", "bit-case"], ["MAGMATR", "magmat"], ["MAGMINI", "magmat"], ["PHG1004RPBK", "air-bit"], ["PHG1005BK", "air-bit"], ["PH3050BR", "air-hammer"],
  ["LDT40", "disconnect-set"], ["GSL832", "ratchet-long", '1/2"'], ["TNF72", "ratchet-round", '1/4"'], ["GTM830", "ratchet", '1/4"'], ["IEDP105", "pliers-pump"],
  ["P92055A", "pliers-needle"], ["YA824C", "pliers"], ["YA1005C", "extractor"], ["PSN500", "trim-tool"], ["SAPB200O", "pry"], ["SPBSDC705FR", "pry"], ["SRXRM710", "set-wrench"],
  ["TPGDL2000HD", "tire-inflator"], ["ECHDH042", "headlamp"], ["ECPN1032R", "flashlight"], ["ECPRB042", "shop"], ["CTRS761", "cl14-saw"], ["CT861AMG", "cl14-impact"], ["CT9055DB", "cl18-impact"],
];

let bad = 0;
for (const [pn, key, drive, size] of CASES) {
  const a = artOf({ part_number: pn, name: "", category: "3/8\" Drive Tools" }); // the add form's default category
  const errs = [];
  if (a.key !== key) errs.push(`drawing ${a.key}, want ${key}`);
  if (drive !== undefined && drive !== null && a.drive !== drive) errs.push(`drive ${a.drive}, want ${drive}`);
  if (size !== undefined && a.size !== size) errs.push(`size ${a.size}, want ${size}`);
  if (errs.length) { bad++; console.log(`${pn.padEnd(12)} ${errs.join("; ")}`); }
}
// a name always wins over the part number
const named = artOf({ part_number: "F80", name: "1/2\" Drive 9/16\" Deep Socket", category: "Other" });
if (named.key !== "socket-deep" || named.drive !== '1/2"') { bad++; console.log("name should win:", named.key, named.drive); }
// numbers we can't read get a plain drawing, not a wrong tool
for (const pn of ["ZZ123", "YA480B", "A78", "GA98A"]) { const a = artOf({ part_number: pn, name: "", category: "Other" }); if (a.key !== "other") { bad++; console.log(`${pn} should be unknown, got ${a.key}`); } }
// what's in a set, read from its number (count, sizes, kind of piece)
for (const [pn, spec] of [["BOERM712", "ratchet;8mm,9mm,10mm,11mm,12mm,13mm,14mm,15mm,16mm,17mm,18mm,19mm"], ["SOEXLM710B", "long;10mm,11mm,12mm,13mm,14mm,15mm,16mm,17mm,18mm,19mm"],
  ["SRXRM710", "ratchet;10mm,11mm,12mm,13mm,14mm,15mm,16mm,17mm,18mm,19mm"], ["206AFX", 'extension;1.5",3",4",6",8",11"'], ["208AFX", 'extension;1.5",3",4",6",8",11",18",24"'],
  ["305ASX", 'extension;2",3",5",8",11"'], ["207IPLFM", "socket-swivel;10mm,11mm,12mm,13mm,14mm,15mm,16mm"], ["310IMMYA", "socket-impact;10mm,11mm,12mm,13mm,14mm,15mm,16mm,17mm,18mm,19mm"]]) {
  const a = artOf({ part_number: pn, name: "", category: "Other" });
  if (a.spec !== spec) { bad++; console.log(`${pn} set holds ${a.spec}, want ${spec}`); }
}
console.log(bad ? `${bad} of ${CASES.length + 5} wrong` : `all ${CASES.length + 5} part numbers right`);
// how much of Snap-on's catalog we can read at all (catalog-part-numbers.tsv: number, catalog description)
const rows = readFileSync(new URL("./catalog-part-numbers.tsv", import.meta.url), "utf8").trim().split("\n").slice(1);
const known = rows.filter((l) => artOf({ part_number: l.split("\t")[0], name: "", category: "Other" }).key !== "other").length;
console.log(`${known} of ${rows.length} catalog part numbers get a tool drawing`);
process.exit(bad ? 1 : 0);
