//! Policy Brief PDF generator. All display strings arrive pre-localized
//! from the frontend; this module only lays them out. Arabic strings are
//! reshaped (presentation forms) and bidi-reordered before drawing, since
//! printpdf draws codepoints verbatim with no shaping engine.

use printpdf::{
    Color, Line, LineDashPattern, LinePoint, Mm, Op, PaintMode, ParsedFont, PdfDocument, PdfPage,
    PdfSaveOptions, Point, Pt, RawImage, Rect, Rgb, XObjectTransform,
};
use serde::{Deserialize, Serialize};

const PAGE_W: f64 = 210.0;
const PAGE_H: f64 = 297.0;
const MARGIN: f64 = 18.0;
const FOOTER_Y: f64 = 12.0;

fn mm(v: f64) -> Mm {
    Mm(v as f32)
}
fn pt(v: f64) -> Pt {
    Pt(v as f32)
}

const FONT_REG: &[u8] = include_bytes!("../assets/fonts/IBMPlexSansArabic-Regular.ttf");
const FONT_BOLD: &[u8] = include_bytes!("../assets/fonts/IBMPlexSansArabic-Bold.ttf");
const LOGO_PNG: &[u8] = include_bytes!("../assets/logo/logo.png");

const NAVY: &str = "#0F2942";
const TEAL: &str = "#0D9488";
const AMBER: &str = "#D97706";
const INK: &str = "#0F172A";
const SLATE: &str = "#475569";
const MUTED: &str = "#94A3B8";
const HAIRLINE: &str = "#E2E8F0";
const CANVAS: &str = "#F8FAFC";

// ---------------------------------------------------------------------------
// Report data (all strings pre-localized by the frontend)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdfPolyline {
    /// Normalized points (0..1, y up) in chart space.
    pub points: Vec<[f64; 2]>,
    pub color: String,
    pub width_pt: f32,
    pub dashed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdfRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdfCurve {
    pub polylines: Vec<PdfPolyline>,
    pub rects: Vec<PdfRect>,
    pub labels: Vec<PdfCurveLabel>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdfCurveLabel {
    pub text: String,
    pub x: f64,
    pub y: f64,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdfReport {
    /// "rtl" or "ltr"
    pub dir: String,
    pub title: String,
    pub subtitle: String,
    pub badge: String,
    pub commodity: String,
    pub timestamp: String,
    pub sec1_title: String,
    pub sec2_title: String,
    pub sec3_title: String,
    pub sec4_title: String,
    /// Section 1: input policy parameters (label, value) rows.
    pub params: Vec<[String; 2]>,
    /// Section 2: key outcomes (metric, value) rows.
    pub outcomes: Vec<[String; 2]>,
    /// Section 3: four-scenario comparison table.
    pub scenario_header: Vec<String>,
    pub scenario_rows: Vec<Vec<String>>,
    pub curve: PdfCurve,
    /// Section 4: methodology + elasticity footnote.
    pub methodology: String,
    pub elasticity_note: String,
    pub footer: String,
}

// ---------------------------------------------------------------------------
// Text shaping + measurement
// ---------------------------------------------------------------------------

fn contains_arabic(s: &str) -> bool {
    s.chars().any(|c| {
        ('\u{0600}'..='\u{06FF}').contains(&c)
            || ('\u{FB50}'..='\u{FDFF}').contains(&c)
            || ('\u{FE70}'..='\u{FEFF}').contains(&c)
    })
}

/// Arabic: reshape to presentation forms, then bidi-reorder to visual
/// order. Latin/other text passes through unchanged.
fn mirror_char(c: char) -> char {
    match c {
        '(' => ')',
        ')' => '(',
        '[' => ']',
        ']' => '[',
        '{' => '}',
        '}' => '{',
        '<' => '>',
        '>' => '<',
        '«' => '»',
        '»' => '«',
        '‹' => '›',
        '›' => '‹',
        _ => c,
    }
}

fn shape_text(s: &str) -> String {
    if !contains_arabic(s) {
        return s.to_string();
    }
    let reshaped = arabic_reshaper::arabic_reshape(s);
    let bidi = unicode_bidi::BidiInfo::new(&reshaped, None);
    // printpdf paints glyphs verbatim left-to-right, so we must emit the
    // visual order ourselves AND mirror paired punctuation inside RTL runs
    // (the step a real bidi renderer does at paint time). Without mirroring,
    // parentheses around units like "(طن)" render inverted.
    let mut out = String::with_capacity(reshaped.len());
    for p in &bidi.paragraphs {
        let (levels, runs) = bidi.visual_runs(p, p.range.clone());
        for range in runs {
            let seg = &reshaped[range.clone()];
            if levels[range.start].is_rtl() {
                out.extend(seg.chars().rev().map(mirror_char));
            } else {
                out.push_str(seg);
            }
        }
    }
    if out.is_empty() {
        reshaped
    } else {
        out
    }
}

fn text_width_pt(font: &ParsedFont, shaped: &str, size_pt: f64) -> f64 {
    let upe = font.as_azul().pdf_font_metrics.units_per_em.max(1) as f64;
    shaped
        .chars()
        .map(|c| {
            let gid = font.lookup_glyph_index(c as u32).unwrap_or(0);
            font.as_azul().get_glyph_width_internal(gid).unwrap_or(0) as f64 / upe * size_pt
        })
        .sum()
}

fn rgb(hex: &str) -> Color {
    let h = hex.trim_start_matches('#');
    let v = u32::from_str_radix(h, 16).unwrap_or(0);
    Color::Rgb(Rgb {
        r: ((v >> 16) & 0xFF) as f32 / 255.0,
        g: ((v >> 8) & 0xFF) as f32 / 255.0,
        b: (v & 0xFF) as f32 / 255.0,
        icc_profile: None,
    })
}

/// Blend a hex color toward white by `t` (0 = original, 1 = white).
fn tint(hex: &str, t: f32) -> Color {
    let h = hex.trim_start_matches('#');
    let v = u32::from_str_radix(h, 16).unwrap_or(0);
    let ch = |x: u32| (x as f32 / 255.0) * (1.0 - t) + t;
    Color::Rgb(Rgb {
        r: ch((v >> 16) & 0xFF),
        g: ch((v >> 8) & 0xFF),
        b: ch(v & 0xFF),
        icc_profile: None,
    })
}

// ---------------------------------------------------------------------------
// Layout engine
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, PartialEq)]
enum Align {
    Start,
    End,
}

struct Builder<'a> {
    font: &'a ParsedFont,
    font_bold: &'a ParsedFont,
    reg_id: printpdf::FontId,
    bold_id: printpdf::FontId,
    rtl: bool,
    pages: Vec<Vec<Op>>,
    ops: Vec<Op>,
    /// Cursor, mm from the TOP of the page.
    y: f64,
}

impl<'a> Builder<'a> {
    fn start_page(&mut self) {
        self.ops = vec![Op::SaveGraphicsState];
        self.y = MARGIN;
    }

    fn finish_page(&mut self) {
        self.ops.push(Op::RestoreGraphicsState);
        self.pages.push(std::mem::take(&mut self.ops));
    }

    /// Ensure at least `height_mm` of vertical space, else page-break.
    fn ensure(&mut self, height_mm: f64) {
        if self.y + height_mm > PAGE_H - FOOTER_Y - 8.0 {
            self.finish_page();
            self.start_page();
        }
    }

    /// Advance the cursor.
    fn gap(&mut self, mm: f64) {
        self.y += mm;
    }

    /// Write one line of text at the current cursor; returns its width in pt.
    fn line(&mut self, text: &str, size_pt: f64, bold: bool, color: &str, align: Align) -> f64 {
        self.line_inset(text, size_pt, bold, color, align, 0.0)
    }

    fn line_inset(&mut self, text: &str, size_pt: f64, bold: bool, color: &str, align: Align, inset_mm: f64) -> f64 {
        let shaped = shape_text(text);
        let font = if bold { self.font_bold } else { self.font };
        let width_pt = text_width_pt(font, &shaped, size_pt);
        let _ = font;
        let width_mm = width_pt * 0.3528;

        let x_mm = match align {
            Align::Start => MARGIN + inset_mm,
            Align::End => PAGE_W - MARGIN - inset_mm - width_mm,
        };

        self.ops.push(Op::StartTextSection);
        self.ops.push(Op::SetTextCursor {
            pos: Point::new(mm(x_mm), mm(PAGE_H - self.y - size_pt * 0.3528)),
        });
        let font_id = if bold { self.bold_id.clone() } else { self.reg_id.clone() };
        self.ops.push(Op::SetFont {
            font: printpdf::PdfFontHandle::External(font_id),
            size: pt(size_pt),
        });
        self.ops.push(Op::SetFillColor { col: rgb(color) });
        self.ops.push(Op::ShowText {
            items: vec![printpdf::TextItem::Text(shaped.clone())],
        });
        self.ops.push(Op::EndTextSection);
        width_mm
    }

    /// Wrapped paragraph; returns the height used (mm).
    fn paragraph(&mut self, text: &str, size_pt: f64, color: &str, max_mm: f64) -> f64 {
        let font = self.font;
        let line_h = size_pt * 1.55 * 0.3528;
        let max_pt = max_mm / 0.3528;

        // Greedy word wrap measured on shaped text.
        let mut lines: Vec<String> = Vec::new();
        let mut cur = String::new();
        for word in text.split(' ') {
            let cand = if cur.is_empty() { word.to_string() } else { format!("{cur} {word}") };
            if text_width_pt(font, &shape_text(&cand), size_pt) <= max_pt || cur.is_empty() {
                cur = cand;
            } else {
                lines.push(std::mem::take(&mut cur));
                cur = word.to_string();
            }
        }
        if !cur.is_empty() {
            lines.push(cur);
        }

        self.ensure(line_h * lines.len() as f64);
        for l in &lines {
            let align = if self.rtl { Align::End } else { Align::Start };
            self.line(l, size_pt, false, color, align);
            self.gap(line_h);
        }
        line_h * lines.len() as f64
    }

    fn hairline(&mut self, y_mm: f64, color: &str, thickness_pt: f32) {
        let y_from_bottom = PAGE_H - y_mm;
        self.ops.push(Op::SetOutlineColor { col: rgb(color) });
        self.ops.push(Op::SetOutlineThickness { pt: pt(thickness_pt as f64) });
        self.ops.push(Op::DrawLine {
            line: Line {
                points: vec![
                    LinePoint { p: Point::new(mm(MARGIN), mm(y_from_bottom)), bezier: false },
                    LinePoint { p: Point::new(mm(PAGE_W - MARGIN), mm(y_from_bottom)), bezier: false },
                ],
                is_closed: false,
            },
        });
    }

    fn fill_rect(&mut self, x_mm: f64, y_mm: f64, w_mm: f64, h_mm: f64, color: Color) {
        self.ops.push(Op::SetFillColor { col: color });
        self.ops.push(Op::DrawRectangle {
            rectangle: Rect {
                x: pt(x_mm * 2.83465),
                y: pt((PAGE_H - y_mm - h_mm) * 2.83465),
                width: pt(w_mm * 2.83465),
                height: pt(h_mm * 2.83465),
                mode: Some(PaintMode::Fill),
                winding_order: None,
            },
        });
    }

    fn section_heading(&mut self, text: &str, follow_mm: f64) {
        self.gap(6.0);
        // Keep the heading with a meaningful chunk of following content.
        self.ensure(follow_mm.max(34.0));
        // Accent bar on the start side.
        let (x, w) = if self.rtl {
            (PAGE_W - MARGIN - 2.0, 2.0)
        } else {
            (MARGIN, 2.0)
        };
        self.fill_rect(x, self.y + 0.8, w, 6.0, rgb(TEAL));
        let align = if self.rtl { Align::End } else { Align::Start };
        self.line_inset(text, 13.0, true, NAVY, align, 4.5);
        self.gap(8.0);
    }

    /// Two-column key/value table (labels start-side, values end-side).
    fn kv_table(&mut self, rows: &[[String; 2]]) {
        let size = 9.5;
        let row_h = 6.5;
        for (i, [k, v]) in rows.iter().enumerate() {
            self.ensure(row_h);
            if i % 2 == 0 {
                self.fill_rect(MARGIN, self.y, PAGE_W - 2.0 * MARGIN, row_h, tint(CANVAS, 0.0));
            }
            let align_k = if self.rtl { Align::End } else { Align::Start };
            let align_v = if self.rtl { Align::Start } else { Align::End };
            self.line(k, size, false, SLATE, align_k);
            self.line(v, size, true, INK, align_v);
            self.y += row_h;
            self.hairline(self.y, HAIRLINE, 0.5);
        }
    }

    /// Multi-column grid table with a navy header row.
    fn grid_table(&mut self, header: &[String], rows: &[Vec<String>]) {
        let cols = header.len();
        let usable = PAGE_W - 2.0 * MARGIN;
        // First (label) column wider; remaining share the rest.
        let first = usable * 0.28;
        let rest = (usable - first) / (cols.saturating_sub(1)).max(1) as f64;
        let mut widths: Vec<f64> = std::iter::once(first).chain(std::iter::repeat(rest).take(cols - 1)).collect();
        if self.rtl {
            widths.reverse();
        }

        let size = 8.0;
        let row_h = 6.2;

        // x positions of each column's start edge (mm).
        let mut xs = vec![MARGIN];
        for w in &widths {
            xs.push(xs.last().unwrap() + w);
        }

        let cell = |b: &mut Self, text: &str, x: f64, w: f64, bold: bool, color: &str| {
            let shaped = shape_text(text);
            let font = if bold { b.font_bold } else { b.font };
            let width_mm = text_width_pt(font, &shaped, size as f64) * 0.3528;
            let pad = 1.5;
            // Numbers/end-side columns centered; first column start-aligned.
            let cx = if width_mm > w - 2.0 * pad {
                x + pad // overflow: clip from start edge
            } else if (x - MARGIN).abs() < 0.01 {
                if b.rtl { x + w - pad - width_mm } else { x + pad }
            } else {
                x + (w - width_mm) / 2.0
            };
            b.ops.push(Op::StartTextSection);
            b.ops.push(Op::SetTextCursor {
                pos: Point::new(mm(cx), mm(PAGE_H - b.y - row_h + 1.6)),
            });
            let font_id = if bold { b.bold_id.clone() } else { b.reg_id.clone() };
            b.ops.push(Op::SetFont {
                font: printpdf::PdfFontHandle::External(font_id),
                size: pt(size),
            });
            b.ops.push(Op::SetFillColor { col: rgb(color) });
            b.ops.push(Op::ShowText {
                items: vec![printpdf::TextItem::Text(shaped)],
            });
            b.ops.push(Op::EndTextSection);
        };

        // Header
        self.ensure(row_h);
        self.fill_rect(MARGIN, self.y, usable, row_h, rgb(NAVY));
        let order: Vec<usize> = if self.rtl { (0..cols).rev().collect() } else { (0..cols).collect() };
        for &ci in &order {
            cell(self, &header[ci], xs[ci], widths[ci], true, "#FFFFFF");
        }
        self.y += row_h;

        for (ri, row) in rows.iter().enumerate() {
            self.ensure(row_h);
            if ri % 2 == 1 {
                self.fill_rect(MARGIN, self.y, usable, row_h, tint(CANVAS, 0.0));
            }
            for &ci in &order {
                let text = row.get(ci).cloned().unwrap_or_default();
                cell(self, &text, xs[ci], widths[ci], false, INK);
            }
            self.y += row_h;
            self.hairline(self.y, HAIRLINE, 0.5);
        }
    }

    /// Vector chart from normalized (0..1, y-up) coordinates.
    fn chart(&mut self, curve: &PdfCurve, height_mm: f64) {
        let x0 = MARGIN;
        let w = PAGE_W - 2.0 * MARGIN;
        self.ensure(height_mm + 6.0);
        let y0 = self.y;

        // Shaded rects (shortage / DWL), tinted toward white.
        for r in &curve.rects {
            self.fill_rect(
                x0 + r.x * w,
                y0 + (1.0 - r.y - r.h) * height_mm,
                r.w * w,
                r.h * height_mm,
                tint(&r.color, 0.85),
            );
        }

        // Frame
        self.ops.push(Op::SetOutlineColor { col: rgb(MUTED) });
        self.ops.push(Op::SetOutlineThickness { pt: pt(0.7) });
        self.ops.push(Op::DrawRectangle {
            rectangle: Rect {
                x: pt(x0 * 2.83465),
                y: pt((PAGE_H - y0 - height_mm) * 2.83465),
                width: pt(w * 2.83465),
                height: pt(height_mm * 2.83465),
                mode: Some(PaintMode::Stroke),
                winding_order: None,
            },
        });

        // Polylines
        for pl in &curve.polylines {
            if pl.points.len() < 2 {
                continue;
            }
            self.ops.push(Op::SetOutlineColor { col: rgb(&pl.color) });
            self.ops.push(Op::SetOutlineThickness { pt: pt(pl.width_pt as f64) });
            if pl.dashed {
                self.ops.push(Op::SetLineDashPattern {
                    dash: LineDashPattern::new(0.0, &[3.0, 2.0]),
                });
            }
            let points = pl
                .points
                .iter()
                .map(|[px, py]| LinePoint {
                    p: Point::new(
                        mm(x0 + px * w),
                        mm(PAGE_H - y0 - (1.0 - py) * height_mm),
                    ),
                    bezier: false,
                })
                .collect();
            self.ops.push(Op::DrawLine { line: Line { points, is_closed: false } });
            if pl.dashed {
                self.ops.push(Op::SetLineDashPattern {
                    dash: LineDashPattern::solid(),
                });
            }
        }

        // Labels (small, LTR math symbols)
        for l in &curve.labels {
            let shaped = shape_text(&l.text);
            let width_mm = text_width_pt(self.font, &shaped, 7.0) * 0.3528;
            let lx = (x0 + l.x * w - width_mm / 2.0).clamp(x0 + 1.0, x0 + w - width_mm - 1.0);
            let ly = y0 + (1.0 - l.y) * height_mm - 2.5;
            self.ops.push(Op::StartTextSection);
            self.ops.push(Op::SetTextCursor {
                pos: Point::new(mm(lx), mm(PAGE_H - ly - 2.5)),
            });
            self.ops.push(Op::SetFont {
                font: printpdf::PdfFontHandle::External(self.reg_id.clone()),
                size: pt(7.0),
            });
            self.ops.push(Op::SetFillColor { col: rgb(&l.color) });
            self.ops.push(Op::ShowText {
                items: vec![printpdf::TextItem::Text(shaped)],
            });
            self.ops.push(Op::EndTextSection);
        }

        self.y += height_mm;
    }
}

// ---------------------------------------------------------------------------
// Font identity
// ---------------------------------------------------------------------------

fn load_fonts() -> Result<(ParsedFont, ParsedFont), String> {
    let mut warn = Vec::new();
    let reg = ParsedFont::from_bytes(FONT_REG, 0, &mut warn)
        .ok_or_else(|| "regular font: failed to parse".to_string())?;
    let bold = ParsedFont::from_bytes(FONT_BOLD, 0, &mut warn)
        .ok_or_else(|| "bold font: failed to parse".to_string())?;
    Ok((reg, bold))
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

pub fn build_pdf(report: &PdfReport) -> Result<Vec<u8>, String> {
    let (font, font_bold) = load_fonts()?;
    let mut doc = PdfDocument::new(&report.title);

    // Register fonts under fixed identities so SetFont can reference them.
    let reg_id = doc.add_font(&font);
    let bold_id = doc.add_font(&font_bold);

    let mut b = Builder {
        font: &font,
        font_bold: &font_bold,
        reg_id: reg_id.clone(),
        bold_id: bold_id.clone(),
        rtl: report.dir == "rtl",
        pages: Vec::new(),
        ops: Vec::new(),
        y: MARGIN,
    };

    // Logo (optional: fall back to typographic header if it cannot decode).
    let logo = RawImage::decode_from_bytes(LOGO_PNG, &mut Vec::new()).ok().map(|img| doc.add_image(&img));

    // ---------------- Page 1 header ----------------
    b.start_page();

    if let Some(id) = &logo {
        let logo_mm = 16.0;
        // Logo sits on the edge opposite the title to avoid overlap.
        let (lx, ly) = if b.rtl {
            (MARGIN, MARGIN)
        } else {
            (PAGE_W - MARGIN - logo_mm, MARGIN)
        };
        b.ops.push(Op::UseXobject {
            id: id.clone(),
            transform: XObjectTransform {
                translate_x: Some(pt(lx * 2.83465)),
                translate_y: Some(pt((PAGE_H - ly - logo_mm) * 2.83465)),
                scale_x: Some(((logo_mm * 2.83465) / 1024.0) as f32),
                scale_y: Some(((logo_mm * 2.83465) / 1024.0) as f32),
                dpi: None,
                rotate: None,
                no_auto_scale: false,
            },
        });
    }

    let title_align = if b.rtl { Align::End } else { Align::Start };
    b.y = MARGIN + 1.0;
    b.line(&report.title, 20.0, true, NAVY, title_align);
    b.gap(9.0);
    b.line(&report.subtitle, 10.5, false, SLATE, title_align);
    b.gap(7.0);

    // Badge pill (amber tint).
    let badge_shaped = shape_text(&report.badge);
    let badge_w_mm = text_width_pt(&font_bold, &badge_shaped, 8.0) * 0.3528 + 6.0;
    let bx = if b.rtl { PAGE_W - MARGIN - badge_w_mm } else { MARGIN };
    b.fill_rect(bx, b.y, badge_w_mm, 6.0, tint(AMBER, 0.88));
    let old_y = b.y;
    b.y = old_y + 0.9;
    b.line(&report.badge, 8.0, true, AMBER, if b.rtl { Align::End } else { Align::Start });
    b.y = old_y + 6.0;

    b.gap(3.0);
    let meta = format!("{} · {}", report.commodity, report.timestamp);
    b.line(&meta, 9.0, false, MUTED, title_align);
    b.gap(4.0);
    b.hairline(b.y, HAIRLINE, 0.8);
    b.gap(4.0);

    // ---------------- Section 1: parameters ----------------
    b.section_heading(&report.sec1_title, 34.0);
    b.kv_table(&report.params);
    b.gap(4.0);

    // ---------------- Section 2: outcomes ----------------
    b.section_heading(&report.sec2_title, 34.0);
    b.kv_table(&report.outcomes);
    b.gap(4.0);

    // ---------------- Section 3: curve + scenario table ----------------
    // Heading must stay with the 72mm chart below it.
    b.section_heading(&report.sec3_title, 92.0);
    b.chart(&report.curve, 72.0);
    b.gap(6.0);
    b.grid_table(&report.scenario_header, &report.scenario_rows);
    b.gap(4.0);

    // ---------------- Section 4: methodology ----------------
    b.section_heading(&report.sec4_title, 34.0);
    b.paragraph(&report.methodology, 9.0, SLATE, PAGE_W - 2.0 * MARGIN);
    b.gap(4.0);
    b.paragraph(&report.elasticity_note, 8.5, MUTED, PAGE_W - 2.0 * MARGIN);

    b.finish_page();

    // ---------------- Footers with page numbers ----------------
    let total = b.pages.len();
    for (i, ops) in b.pages.iter_mut().enumerate() {
        // hairline
        ops.push(Op::SetOutlineColor { col: rgb(HAIRLINE) });
        ops.push(Op::SetOutlineThickness { pt: pt(0.5) });
        ops.push(Op::DrawLine {
            line: Line {
                points: vec![
                    LinePoint { p: Point::new(mm(MARGIN), mm(FOOTER_Y + 4.0)), bezier: false },
                    LinePoint { p: Point::new(mm(PAGE_W - MARGIN), mm(FOOTER_Y + 4.0)), bezier: false },
                ],
                is_closed: false,
            },
        });
        let page_no = format!("{}/{}", i + 1, total);
        let (footer_align, page_align) = if b.rtl {
            (Align::End, Align::Start)
        } else {
            (Align::Start, Align::End)
        };
        let shaped_footer = shape_text(&report.footer);
        let w_mm = text_width_pt(&font, &shaped_footer, 7.5) * 0.3528;
        let fx = match footer_align {
            Align::Start => MARGIN,
            Align::End => PAGE_W - MARGIN - w_mm,
        };
        ops.push(Op::StartTextSection);
        ops.push(Op::SetTextCursor { pos: Point::new(mm(fx), mm(FOOTER_Y)) });
        ops.push(Op::SetFont { font: printpdf::PdfFontHandle::External(reg_id.clone()), size: pt(7.5) });
        ops.push(Op::SetFillColor { col: rgb(MUTED) });
        ops.push(Op::ShowText { items: vec![printpdf::TextItem::Text(shaped_footer)] });
        ops.push(Op::EndTextSection);

        let pw = text_width_pt(&font, &page_no, 7.5) * 0.3528;
        let px = match page_align {
            Align::End => PAGE_W - MARGIN - pw,
            _ => MARGIN,
        };
        ops.push(Op::StartTextSection);
        ops.push(Op::SetTextCursor { pos: Point::new(mm(px), mm(FOOTER_Y)) });
        ops.push(Op::SetFont { font: printpdf::PdfFontHandle::External(reg_id.clone()), size: pt(7.5) });
        ops.push(Op::SetFillColor { col: rgb(MUTED) });
        ops.push(Op::ShowText { items: vec![printpdf::TextItem::Text(page_no)] });
        ops.push(Op::EndTextSection);
    }

    let pages: Vec<PdfPage> = b
        .pages
        .into_iter()
        .map(|ops| PdfPage::new(mm(PAGE_W), mm(PAGE_H), ops))
        .collect();
    doc.with_pages(pages);

    let mut warnings = Vec::new();
    let bytes = doc.save(&PdfSaveOptions::default(), &mut warnings);
    if !warnings.is_empty() {
        eprintln!("PDF build warnings: {warnings:?}");
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    const CRIMSON: &str = "#DC2626";

    fn sample_report(dir: &str) -> PdfReport {
        let ar = dir == "rtl";
        PdfReport {
            dir: dir.to_string(),
            title: if ar { "موجز السياسة — SCOPE Lens" } else { "Policy Brief — SCOPE Lens" }.to_string(),
            subtitle: if ar { "مُقيِّم سياسات الدعم وتسقيف الأسعار" } else { "Subsidy and Cap Outcome Policy Evaluator" }.to_string(),
            badge: if ar { "بيانات توضيحية" } else { "Illustrative Simulation Data" }.to_string(),
            commodity: if ar { "بطاطا" } else { "Potatoes" }.to_string(),
            timestamp: "2026-11-15 18:00".to_string(),
            sec1_title: if ar { "ملخص تنفيذي ومعطيات الإدخال" } else { "Executive Summary & Input Parameters" }.to_string(),
            sec2_title: if ar { "النتائج الرئيسة والأثر على الرفاه" } else { "Key Simulated Outcomes & Welfare Impact" }.to_string(),
            sec3_title: if ar { "منحنى العرض والطلب ومقارنة السيناريوهات" } else { "Supply/Demand Curve & Scenario Comparison" }.to_string(),
            sec4_title: if ar { "المنهجية وافتراضات المرونة" } else { "Methodology & Elasticity Assumptions" }.to_string(),
            params: vec![
                [if ar { "سقف سعر التجزئة" } else { "Retail ceiling" }.into(), format!("80 DZD/kg")],
                [if ar { "الدعم" } else { "Subsidy" }.into(), "20 DZD/kg".into()],
                [if ar { "تفريغ المخزون" } else { "Stock release" }.into(), "5,000 t".into()],
            ],
            outcomes: vec![
                [if ar { "العجز في السوق" } else { "Market shortage" }.into(), "11,075 t".into()],
                [if ar { "سعر السوق الموازية" } else { "Parallel price" }.into(), "1,931 DZD/kg".into()],
            ],
            scenario_header: vec![
                if ar { "المؤشر" } else { "Metric" }.into(),
                if ar { "لا تدخل" } else { "No int." }.into(),
                if ar { "تسقيف فقط" } else { "Ceiling" }.into(),
                if ar { "تسقيف + تفريغ" } else { "Ceil.+stock" }.into(),
                if ar { "دعم مباشر" } else { "Subsidy" }.into(),
            ],
            scenario_rows: vec![
                vec!["shortage".into(), "0".into(), "21,246".into(), "16,456".into(), "0".into()],
                vec!["p_par".into(), "120".into(), "52,954".into(), "22,877".into(), "120".into()],
            ],
            curve: PdfCurve {
                polylines: vec![
                    PdfPolyline { points: vec![[0.0, 1.0], [1.0, 0.0]], color: NAVY.into(), width_pt: 1.6, dashed: false },
                    PdfPolyline { points: vec![[0.0, 0.0], [1.0, 1.0]], color: TEAL.into(), width_pt: 1.6, dashed: false },
                    PdfPolyline { points: vec![[0.0, 0.4], [1.0, 0.4]], color: AMBER.into(), width_pt: 1.0, dashed: true },
                ],
                rects: vec![PdfRect { x: 0.4, y: 0.0, w: 0.2, h: 0.4, color: AMBER.into() }],
                labels: vec![
                    PdfCurveLabel { text: "P*".into(), x: 0.5, y: 0.5, color: TEAL.into() },
                    PdfCurveLabel { text: "P_par".into(), x: 0.85, y: 0.93, color: CRIMSON.into() },
                ],
            },
            methodology: if ar {
                "دوال طلب وعرض ثابتة المرونة معايرة حول السعر المرجعي، مع قاعدة تحويل إلى السوق الموازية تعتمد على ضغط الهامش وشدة الرقابة.".into()
            } else {
                "Constant-elasticity demand and supply calibrated around the reference price, with a diversion rule driven by the margin squeeze and enforcement intensity.".into()
            },
            elasticity_note: if ar {
                "نطاقات مرجعية: مرونة الطلب بين −0.1 و−0.6، ومرونة العرض بين 0.05 و0.8.".into()
            } else {
                "Reference ranges: demand elasticity −0.1 to −0.6; supply elasticity 0.05 to 0.8.".into()
            },
            footer: if ar { "SCOPE Lens — بيانات توضيحية" } else { "SCOPE Lens — Illustrative data" }.to_string(),
        }
    }

    #[test]
    fn builds_arabic_and_english_pdfs() {
        for dir in ["rtl", "ltr"] {
            let bytes = build_pdf(&sample_report(dir)).expect("pdf build");
            assert!(bytes.starts_with(b"%PDF"), "must be a PDF");
            assert!(bytes.len() > 20_000, "embedded fonts expected, got {}", bytes.len());
            let path = std::env::temp_dir().join(format!("scope-lens-test-{dir}.pdf"));
            std::fs::write(&path, &bytes).unwrap();
            eprintln!("wrote {}", path.display());
        }
    }

    /// Contract test: fixtures produced by the real frontend code path
    /// (src/pdfReport.ts + locale dictionaries) must deserialize and build.
    #[test]
    fn builds_frontend_fixture_reports() {
        for (name, json) in [
            ("ar", include_str!("../tests/fixtures/report-ar.json")),
            ("fr", include_str!("../tests/fixtures/report-fr.json")),
        ] {
            let report: PdfReport = serde_json::from_str(json).unwrap_or_else(|e| panic!("{name} fixture: {e}"));
            let bytes = build_pdf(&report).expect("pdf build");
            assert!(bytes.starts_with(b"%PDF"));
            assert!(bytes.len() > 20_000, "{name}: embedded fonts expected, got {}", bytes.len());
            let path = std::env::temp_dir().join(format!("scope-lens-fixture-{name}.pdf"));
            std::fs::write(&path, &bytes).unwrap();
            eprintln!("wrote {}", path.display());
        }
    }

    /// Extreme outputs (runaway parallel price → compact "1 مليون"/"1 M",
    /// French large-number thousands separators) must build without panic.
    /// These exercise the compact-notation path the normal fixtures never hit.
    #[test]
    fn builds_frontend_extreme_fixtures() {
        for (name, json) in [
            ("ar-extreme", include_str!("../tests/fixtures/report-ar-extreme.json")),
            ("fr-extreme", include_str!("../tests/fixtures/report-fr-extreme.json")),
        ] {
            let report: PdfReport = serde_json::from_str(json).unwrap_or_else(|e| panic!("{name} fixture: {e}"));
            let bytes = build_pdf(&report).expect("extreme pdf build");
            assert!(bytes.starts_with(b"%PDF"));
            assert!(bytes.len() > 20_000, "{name}: embedded fonts expected, got {}", bytes.len());
            let path = std::env::temp_dir().join(format!("scope-lens-fixture-{name}.pdf"));
            std::fs::write(&path, &bytes).unwrap();
            eprintln!("wrote {}", path.display());
        }
    }

    /// The frontend pdfSafe normalizes NBSP (U+00A0) and narrow NBSP (U+202F)
    /// to a plain space because the embedded font may lack those glyphs.
    /// Confirm the normalization target (plain space) is always present, and
    /// report coverage of the variants so a regression is visible.
    #[test]
    fn space_glyph_coverage() {
        let (font, _) = load_fonts().expect("fonts");
        let has = |c: char| font.lookup_glyph_index(c as u32).is_some();
        eprintln!(
            "glyph coverage: space(U+0020)={} nbsp(U+00A0)={} narrow-nbsp(U+202F)={}",
            has(' '), has('\u{00a0}'), has('\u{202f}')
        );
        assert!(has(' '), "plain space must have a glyph (pdfSafe normalization target)");
        // Arabic compact scale words used by ar-DZ compact notation.
        for c in "مليونألف".chars() {
            assert!(has(c), "Arabic letter {c} must have a glyph");
        }
    }
}
