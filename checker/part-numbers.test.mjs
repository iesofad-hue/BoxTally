// Checks that Snap-on part numbers get the right drawing, drive and size.
// Run: node checker/part-numbers.test.mjs
// Every number below is a real one from Snap-on's catalogs, with what the catalog says it is.
import { readFileSync } from "node:fs";

// the drawings (drawings.js) set window.BX_ART; app.js reads them from there
const window = {};
new Function("window", readFileSync(new URL("../drawings.js", import.meta.url), "utf8"))(window);
const html = readFileSync(new URL("../app.js", import.meta.url), "utf8").split("\n");
const from = html.findIndex((l) => /^  const ART = window\.BX_ART;/.test(l));
const to = html.findIndex((l, i) => i > from && /^  \/\/ Where each drawing's bottom edge/.test(l));
const { artOf, catOf } = new Function("state", "storeOf", "window", html.slice(from, to).join("\n") + "\nreturn { artOf, catOf };")({ catalog: {} }, () => null, window);

// [part number, drawing, drive, size]  (drive/size left out = not checked)
const CASES = [
  ["BLPBSS40", "bit-socket-case", '1/4"'], ["SGDMRC44FR", "set-sd-case"],
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
  // screwdriver bits: [part number, "insert-bit", no drive, size]
  ["SDM222ZB", "insert-bit", null, "#2"], ["SDM423B", "insert-bit", null, "#3"], ["SDMT150D", "insert-bit", null, "T15"], ["SDMT307A", "insert-bit", null, "T7"], ["SDMTA55", "insert-bit", null, "T55"],
  ["SDM2704D", "insert-bit", null, '1/16"'], ["SDM3705", "insert-bit", null, '5/64"'], ["SDMA4720", "insert-bit", null, '5/16"'], ["SDMM2702.5B", "insert-bit", null, "2.5mm"],
  ["SDM242G", "insert-bit", null, '3/32"'], ["SDM211B", "insert-bit", null, null], ["BLPHB964", "insert-bit", null, '9/64"'], ["BLPHBM4", "insert-bit", null, "4mm"], ["BTW0A", "insert-bit", null, "#0"],
  ["SDM400A", "set-bit"], ["SDM32KT", "set-bit"], ["SHORTORX", "set-bit"],
  ["TUAM6E3", "socket-bit", '3/8"', "6mm"], ["TMAM2E2A", "socket-bit", '3/8"', "2mm"], ["BLPTMBS3814", "socket-bit", '3/8"'], ["GM3043", "extension", '1/4"', '4"'],
  ["S13TURBO", "speeder", '1/2"'], ["L53HB", "breaker", '1"'], ["BWD48", "socket", '3/4"'], ["YA1860A", "knife"], ["YA817", "set-punch"], ["PB24A", "bit-case"], ["C0612A", "tool-bag"],
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
  ["BOER8", "wrench-ratchet"], ["BOERMF12A", "wrench-ratchet", null, "12 mm"], ["R1214C", "wrench-rbox", null, "3/8 × 7/16"], ["RBM1011C", "wrench-rbox", null, "10 × 11 mm"],
  ["BXOR1012", "wrench-rbox"], ["XB1214A", "wrench-box", null, "3/8 × 7/16"], ["XBM1214A", "wrench-box", null, "12 × 14 mm"], ["XS67A", "wrench-box"], ["XO1012", "wrench-box"],
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
  ["PTM18AM", "pickup"], ["PTM2AM", "pickup"], ["PTM18AMO", "pickup"], ["PTM2AMG", "pickup"], ["PTM157", "mirror"],
  ["PK100", "knife"], ["KER1440", "knife"], ["CSA12C", "scraper"], ["PKB50", "scraper"], ["8MA", "file"], ["10R", "file"], ["HS18A", "hacksaw"],
  ["JCW60BL", "creeper"], ["FJ200", "floor-jack"], ["CG240", "puller"], ["CJ83C", "puller"], ["ECFLED84", "shop"],
  // diagnostics and storage
  ["EEDM504F", "multimeter"], ["EEMS341", "diag-tablet"], ["EETH400", "diag-handheld"], ["KRA4107", "storage"], ["KRL1022", "storage"], ["KMP3415", "storage"], ["KRSC326", "storage-cart"],
  // cordless (14.4V: 7xx/8xx, 18V: 88xx/9xxx)
  ["CT861", "cl14-impact"], ["CT861DB", "cl14-impact"], ["CT825", "cl14-impact"], ["CTR814DB", "cl14-ratchet"], ["CTR867", "cl14-ratchet"], ["CTR761", "cl14-ratchet"], ["CTR881GMDB", "cl14-ratchet"],
  ["CTS861", "cl14-driver"], ["CDR861", "cl14-drill"], ["CTB8174", "cl14-battery"], ["CT9075", "cl18-impact"], ["CT8850", "cl18-impact"], ["CT9010", "cl18-impact"],
  ["CDR9015", "cl18-drill"], ["CTGR8850", "cl18-grinder"], ["CTGRS8825", "grinder-die"], ["CTRS8850", "cl18-saw"], ["CTB185", "cl18-battery"], ["CTB8185", "cl18-battery"],
  ["CTC772A", "charger"], ["CGRS861", "cl14-die"], ["CDRR2005DB", "cl14-drill"], ["CDRR200545K2", "cl14-drill"], ["CTPP761", "cl14-polisher"], ["CTBF8818DB", "polisher"],
  // fadie's own 14.4V tools (all 7 must get the 14.4V look, not the 18V one)
  ["CTR827", "cl14-ratchet"], ["CTR868GMDB", "cl14-ratchet"], ["CTR881", "cl14-ratchet"], ["CGRS861", "cl14-die"], ["CTRS761", "cl14-saw"], ["CT861AMG", "cl14-impact"], ["CTPP861", "cl14-polisher"],
  ["CTR761", "cl14-ratchet"], ["CT761", "cl14-impact"], ["CTS761", "cl14-driver"], ["CDR761", "cl14-drill"], ["CTB8172", "cl14-battery"],
  ["CTLED861", "shop"], ["CTRG9050", "rivet"], ["CGG8850", "grease-gun"],
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
  ["R810C", "wrench-rbox", null, "1/4 × 5/16"], ["RBM78SC", "wrench-rbox", null, "7 × 8 mm"], ["RYAM910", "wrench-rbox"], ["RTBM10", "wrench-ratchet", null, "10 mm"], ["RTB607", "set-wrench"],
  ["XBM1214SA", "wrench-box"], ["VSM5210B", "wrench-open", null, "10 mm"], ["VS814A", "set-wrench"], ["OXI709SBK", "set-wrench"], ["BLPCW516", "wrench", null, '5/16"'], ["BLPCWS711", "set-wrench"],
  ["96CF", "pliers-needle"], ["196CF", "pliers-needle"], ["411BCP", "pliers-needle"], ["912AEP", "pliers-needle"], ["91ACP", "pliers-pump"], ["47ACP", "pliers"], ["LP30A", "set-punch"],
  ["SGDTX50BR", "set-screwdriver"], ["SGDTX320BR", "screwdriver-torx"], ["SGDET70", "set-screwdriver"], ["GSHDX80R", "set-screwdriver"], ["SGDMRC103A", "set-screwdriver"],
  ["30SSD", "screwdriver"], ["120SSDP", "screwdriver-phillips"], ["SSM3", "screwdriver"], ["102NDL10", "nutdriver"], ["CSSC9", "insulated"],
  ["PPC808A", "punch"], ["PPC12B", "punch"], ["BPPC1878", "punch"], ["PPC714B", "punch-pin"], ["PPC104A", "punch-pin"], ["PPC710A", "set-punch"], ["PPB20AK", "set-punch"], ["1210B", "punch-pin"],
  ["1250", "pry"], ["BP8B", "hammer-ballpeen"], ["HLE24", "hammer-deadblow"], ["HD4SG", "hammer-sledge"], ["5NHRA", "file"], ["SGHF614BR", "file"],
  ["PSLR4-1", "pick"], ["SGLASA204", "set-pick"], ["YA338", "pick"], ["GA294", "mirror"], ["GA265A", "pickup"], ["MS800", "scraper"], ["YA405A", "knife"], ["PIT160", "hand-impact"],
  // fadie's own box (2026-10-20): every number checked against Snap-on's listing
  ["OFCA1", "filter-spider"], ["0FCA1KT", "filter-spider"], ["206AFX", "set-extension", '3/8"'], ["305ASX", "set-extension", '1/2"'], ["207IPLFM", "set", '3/8"'],
  ["ADHWS10", "wrench-adjust"], ["ADHWS8O", "wrench-adjust"], ["ADWS8O", "wrench-adjust"], ["BLPBTWKIT", "set-kit", '1/4"'], ["BLPHSM1440", "socket-bit", '1/4"', "4mm"],
  ["C0100", "tool-bag"], ["PB206B", "bit-case"], ["MAGMATR", "magmat"], ["MAGMINI", "magmat"], ["PHG1004RPBK", "air-bit"], ["PHG1005BK", "air-bit"], ["PH3050BR", "air-hammer"],
  ["LDT40", "disconnect-set"], ["GSL832", "ratchet-long", '1/2"'], ["TNF72", "ratchet-round", '1/4"'], ["GTM830", "ratchet", '1/4"'], ["IEDP105", "pliers-pump"],
  ["P92055A", "pliers-needle"], ["YA824C", "pliers"], ["YA1005C", "extractor"], ["PSN500", "trim-tool"], ["SAPB200O", "pry"], ["SPBSDC705FR", "pry"], ["SRXRM710", "set-wrench"],
  ["TPGDL2000HD", "tire-inflator"], ["ECHDH042", "headlamp"], ["ECPN1032R", "flashlight"], ["ECPRB042", "puck-light"], ["ECPRB042OM", "puck-light"], ["CTINF9010", "cl18-inflator"], ["CTPP861BKDB", "cl14-polisher"], ["CTRS761", "cl14-saw"], ["CT861AMG", "cl14-impact"], ["CT9055DB", "cl18-impact"],
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
for (const [pn, spec] of [["BOERM712", "ratchet+rev;8mm,9mm,10mm,11mm,12mm,13mm,14mm,15mm,16mm,17mm,18mm,19mm"], ["SOEXLM710B", "combo+long;10mm,11mm,12mm,13mm,14mm,15mm,16mm,17mm,18mm,19mm"],
  ["SRXRM710", "speed;10mm,11mm,12mm,13mm,14mm,15mm,16mm,17mm,18mm,19mm"], ["206AFX", 'extension;1.5",3",4",6",8",11"'], ["208AFX", 'extension;1.5",3",4",6",8",11",18",24"'],
  ["305ASX", 'extension;2",3",5",8",11"'], ["207IPLFM", "socket-swivel;10mm,11mm,12mm,13mm,14mm,15mm,16mm"], ["310IMMYA", "socket-impact;10mm,11mm,12mm,13mm,14mm,15mm,16mm,17mm,18mm,19mm"]]) {
  const a = artOf({ part_number: pn, name: "", category: "Other" });
  if (a.spec !== spec) { bad++; console.log(`${pn} set holds ${a.spec}, want ${spec}`); }
}
// how a tool looks inside its kind, read from the number: [part number, kind, look, label]
const LOOKS = [
  ["SRXRM13", "wrench-speed", "", "Speed open-end wrench"], ["RBM1213C", "wrench-rbox", "", "Ratcheting box wrench"], ["SOEXLM13", "wrench", "long", "Long combination wrench"],
  ["OXIM13B", "wrench", "midget", "Midget combination wrench"], ["OSHM130B", "wrench", "6pt", "6-point combination wrench"], ["GOEXM13B", "wrench", "ind", "Industrial combination wrench"],
  ["FHOM13B", "wrench", "flex", "Flex-head combination wrench"], ["OEXRM13", "wrench-ratchet", "", "Ratcheting wrench"], ["BOERM13", "wrench-ratchet", "rev", "Reversible ratcheting wrench"],
  ["BOERMF13A", "wrench-ratchet", "rev+flex", "Flex-head ratcheting wrench"], ["RYAM1314", "wrench-rbox", "off25", "Offset ratcheting box wrench"], ["XOM1214", "wrench-box", "deep", "Deep offset box wrench"],
  ["SBXM1213", "wrench-box", "s", "S-shaped box wrench"], ["LTAM1214", "wrench-box", "slim", "Slimline box wrench"], ["VSM5213B", "wrench-open", "angle", "Angle-head open-end wrench"],
  ["OEXM130B", "wrench", "", "Combination wrench"], ["FCF72", "ratchet-flex", "compact", "Compact flex-head ratchet"], ["FLLF80", "ratchet-long-flex", "xlong", "Extra-long flex-head ratchet"],
  ["TNF72", "ratchet-round", "flex", "Round swivel-head ratchet"], ["GSL832", "ratchet-long", "ind", "Industrial long-handle ratchet"], ["FX80", "ratchet-flex", "lock", "Locking flex-head ratchet"],
  ["FR936", "ratchet", "qr", "Quick-release ratchet"], ["FHBF80", "ratchet-flex-soft", "bent", "Bent-handle flex ratchet"], ["S80", "ratchet", "", "Ratchet"],
  ["CTR827", "cl14-ratchet", "neck", "14.4V long-neck ratchet"], ["CTR868GMDB", "cl14-ratchet", "c-gm+neck", "Gunmetal 14.4V long-neck ratchet"], ["CTR869", "cl14-ratchet", "xneck", "14.4V extra-long ratchet"],
  ["PHG1004RPBK", "air-bit", "n4+rp", "4 pc roll pin punch bit set"], ["PHG1005BK", "air-bit", "n5", "5 pc air hammer bit set"], ["PHG1066BK", "air-bit", "n6", "6 pc air hammer bit set"],
  // screwdriver bits: tip from the number, size printed, long power bits, tamper-resistant and wobble Torx
  ["SDM222ZB", "insert-bit", "t-ph", "Phillips bit"], ["SDM522A", "insert-bit", "t-ph+long", "Phillips power bit"], ["SDM252C", "insert-bit", "t-pz", "Pozidriv bit"],
  ["SDM213B", "insert-bit", "t-flat", "Flat tip bit"], ["SDM244G", "insert-bit", "t-clutch", "Clutch bit"], ["SDM231A", "insert-bit", "t-rp", "Reed & Prince bit"],
  ["SDMT25D", "insert-bit", "t-tx", "Torx bit"], ["SDMT325B", "insert-bit", "t-tx", "Torx bit"], ["SDMT425", "insert-bit", "t-tx+long", "Torx power bit"],
  ["SDMTR20", "insert-bit", "t-tx+tr", "Tamper-resistant Torx bit"], ["SDMTW15A", "insert-bit", "t-tx+wob", "Torx wobble bit"], ["SDMW222A", "insert-bit", "t-ph+wob", "Phillips wobble bit"],
  ["SDM2708D", "insert-bit", "t-hex", "Hex bit"], ["SDMA4712", "insert-bit", "t-hex+long", "Hex power bit"], ["BTW2A", "insert-bit", "t-tw", "Tri-Wing bit"], ["BTS1", "insert-bit", "t-sq", "Square bit"],
  ["BLPTB25TP", "insert-bit", "t-tx+tr", "Tamper-resistant Torx bit"], ["RKRF80", "repair-kit", "", "Ratchet repair kit"], ["RKRF841JT", "repair-kit", "", "Flex joint repair kit"],
  ["FXKLP", "repair-kit", "", "Extension locking pins (5 pk)"], ["2430C", "pry", "", "Pinch bar"], ["JCK7D", "magmat", "", "Fender cover"],
  ["CTR881", "cl14-ratchet", "fast", "14.4V high-speed ratchet"], ["CDR9050", "cl18-drill", "hammer", "18V hammer drill"], ["CT861G", "cl14-impact", "c-g", "Green 14.4V cordless impact"],
  ["CTR861HV", "cl14-ratchet", "c-hv", "Hi-viz 14.4V cordless ratchet"], ["CT861AMG", "cl14-impact", "c-g", "Green 14.4V cordless impact"], ["CGRS861", "cl14-die", "", "14.4V die grinder"],
];
for (const [pn, key, look, label] of LOOKS) {
  const a = artOf({ part_number: pn, name: "", category: "Other" }), got = (a.look || []).join("+");
  if (a.key !== key || got !== look || a.label !== label) { bad++; console.log(`${pn.padEnd(12)} looks ${a.key} ${got} "${a.label}", want ${key} ${look} "${label}"`); }
}
// a bit named in words gets its tip from the name; a bit socket stays a bit socket
for (const [name, key, look] of [["Torx T25 bit", "insert-bit", "t-tx"], ["#2 Phillips power bit, 3\"", "insert-bit", "t-ph+long"], ["3/8\" drive T40 bit socket", "socket-bit", ""], ["Bit holder", null, ""]]) {
  const a = artOf({ part_number: "", name, category: "Other" }), got = (a.look || []).join("+");
  if ((key && a.key !== key) || (!key && a.key === "insert-bit") || (key === "insert-bit" && got !== look)) { bad++; console.log(`"${name}" reads ${a.key} ${got}, want ${key} ${look}`); }
}
// a name that says how it looks wins over the number's guess
const longNamed = artOf({ part_number: "OEXM130B", name: "Long combination wrench 13mm", category: "Other" });
if (!longNamed.look?.includes("long")) { bad++; console.log("name should make a long wrench:", longNamed.look); }
// tools saved without a category ("Other") show the one their part number says
const CATS = [["MAGMATR", "Shop & Tech"], ["CTINF9010", "Power Tools"], ["EESC337W", "Diagnostics"], ["PH3050BR", "Power Tools"], ["CTR827", "Power Tools"],
  ["YA1005C", "General Hand Tools"], ["BOERM712", "Service Tools - Sets"], ["GSL832", '1/2" Drive Tools'], ["TL936", '1/4" Drive Tools'], ["SN36", '1/2" Drive Tools'],
  ["87BCF", "Pliers"], ["HBBD56", "Hammers"], ["SAPB200O", "Prybars"], ["SGDMRC11A", "Screwdrivers"], ["ADHW8AO", "Wrenches"], ["PB206B", "Tool Storage"], ["BLPBSS40", "Service Tools - Sets"], ["SDMT25D", "Screwdrivers"], ["RKRF80", "General Hand Tools"], ["ZZZ", "Other"]];
for (const [pn, cat] of CATS) { const got = catOf({ part_number: pn, name: "", category: "Other" }); if (got !== cat) { bad++; console.log(`${pn.padEnd(12)} category ${got}, want ${cat}`); } }
// Tool Storage picked for a tool sold in a case: the number decides the drawing
if (artOf({ part_number: "SGDMRC44FR", name: "", category: "Tool Storage" }).key !== "set-sd-case") { bad++; console.log("SGDMRC44FR in Tool Storage should still be a screwdriver set"); }
if (artOf({ part_number: "KETP682A0ZDL", name: "", category: "Tool Storage" }).key !== "storage") { bad++; console.log("a roll cab in Tool Storage should stay a roll cab"); }
// a category someone picked stays
if (catOf({ part_number: "MAGMATR", name: "", category: "Tool Storage" }) !== "Tool Storage") { bad++; console.log("picked category should stay"); }
// tool storage: only the piece the number names, at its real width, banks and drawers ("type;width;full/banks;flags")
const BOXES = [
  ["KETP682A0ZDL", "", "storage", "cab;68;3/4,2;p", 'EPIQ 68" 9-drawer double-bank roll cab with PowerDrawer'],
  ["KETN682C7PZR", "", "storage", "cab;68;2/5,3;l", 'EPIQ 68" 10-drawer double-bank roll cab, bed liner top'],
  ["KETN602C1PJJ", "", "storage", "cab;60;2/5,3;ss", 'EPIQ 60" 10-drawer double-bank roll cab, stainless top'],
  ["KETN843C1PJK", "", "storage", "cab;84;1/7,5,3;ss"], ["KEXP725D0PBO", "", "storage", "cab;144;2/6,6,5,4,3;p"],
  ["KTL1023APC7", "", "storage", "cab;72;2/7,5,4;l", 'Masters 72" 18-drawer triple-bank roll cab, bed liner top'],
  ["KTL1022ABFI", "", "storage", "cab;54;2/5,3;", 'Masters 54" 10-drawer double-bank roll cab'], ["KRL1056DPCM", "", "storage", "cab;36;0/8;"],
  ["KCP2422POT", "", "storage", "cab;55;3/4,2;p"], ["KRA4107FPBO", "", "storage", "cab;40;0/7;", 'Heritage 40" 7-drawer single-bank roll cab'], ["KRA4813FPJK", "", "storage", "cab;40;2/7,4;"],
  ["KRL791APBO", "", "storage-chest", "chest;54;2/3,3;", 'Masters 54" 8-drawer top chest'], ["KECN682A", "", "storage-chest", "chest;68;2/4,4;"],
  ["KEHN680A", "", "storage", "hutch;68;0/0;", 'EPIQ 68" overhead cabinet (hutch)'], ["KEWN680C0BPS", "", "storage", "riser;68;0/0;"], ["KRL7968A", "", "storage", "riser;68;0/0;"],
  ["KELP301CLZIJ", "", "storage", "locker;24;0/4;L+p", "EPIQ left side Power Locker"], ["KRL1011APBO", "", "storage", "end;20;0/8;"], ["KRA229", "", "storage", "hand;20;0/1;", "Metal tool box"],
  ["", "11-drawer roll cab", "storage", "cab;54;2/6,3;"], ["", "Tool chest", "storage-chest", "chest;54;2/4,4;"],
];
for (const [pn, name, key, box, label] of BOXES) {
  const a = artOf({ part_number: pn, name, category: "Other" });
  if (a.key !== key || a.box !== box || (label && a.label !== label)) { bad++; console.log(`${(pn || name).padEnd(12)} box ${a.key} ${a.box} "${a.label}", want ${key} ${box} "${label || ""}"`); }
}
console.log(bad ? `${bad} of ${CASES.length + LOOKS.length + BOXES.length + 10} wrong` : `all ${CASES.length + LOOKS.length + BOXES.length + 10} part numbers right`);
// how much of Snap-on's catalog we can read at all (catalog-part-numbers.tsv: number, catalog description)
const rows = readFileSync(new URL("./catalog-part-numbers.tsv", import.meta.url), "utf8").trim().split("\n").slice(1);
const known = rows.filter((l) => artOf({ part_number: l.split("\t")[0], name: "", category: "Other" }).key !== "other").length;
console.log(`${known} of ${rows.length} catalog part numbers get a tool drawing`);
process.exit(bad ? 1 : 0);
