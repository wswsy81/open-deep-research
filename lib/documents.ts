import { type Report } from '@/types'
import {
  Document,
  Paragraph,
  TextRun,
  AlignmentType,
  Packer,
  Header,
  Footer,
  PageNumber,
} from 'docx'
import jsPDF from 'jspdf'
import MarkdownIt from 'markdown-it'

const md = new MarkdownIt()

export async function generateDocx(report: Report): Promise<Buffer> {
  try {
    const doc = new Document({
      sections: [
        {
          properties: {},
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: report.title || 'Untitled Report',
                      size: 48,
                      bold: true,
                    }),
                  ],
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 800 },
                }),
              ],
            }),
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  children: [
                    new TextRun('Page '),
                    new TextRun({
                      children: [PageNumber.CURRENT],
                    }),
                    new TextRun(' of '),
                    new TextRun({
                      children: [PageNumber.TOTAL_PAGES],
                    }),
                  ],
                  alignment: AlignmentType.CENTER,
                }),
              ],
            }),
          },
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: report.summary || '',
                  size: 24,
                }),
              ],
              spacing: { before: 800, after: 800 },
              alignment: AlignmentType.JUSTIFIED,
            }),
            ...report.sections.flatMap((section) => [
              new Paragraph({
                children: [
                  new TextRun({
                    text: section.title || '',
                    size: 32,
                    bold: true,
                  }),
                ],
                spacing: { before: 800, after: 400 },
                alignment: AlignmentType.LEFT,
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: section.content || '',
                    size: 24,
                  }),
                ],
                spacing: { before: 400, after: 800 },
                alignment: AlignmentType.JUSTIFIED,
              }),
            ]),
          ],
        },
      ],
    })

    return await Packer.toBuffer(doc)
  } catch (error) {
    console.error('Error generating DOCX:', error)
    throw error
  }
}

export async function generatePdf(report: Report): Promise<Uint8Array> {
  try {
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4',
      putOnlyUsedFonts: true,
      compress: true
    })

    // 设置中文字体和语言
    pdf.setFont('helvetica', 'normal')
    pdf.setLanguage('zh-CN')

    const pageWidth = pdf.internal.pageSize.width
    const margin = 40
    const contentWidth = pageWidth - 2 * margin
    let y = margin

    // 标题
    pdf.setFontSize(24)
    const titleLines = pdf.splitTextToSize(report.title || 'Untitled Report', contentWidth)
    pdf.text(titleLines, pageWidth / 2, y, { align: 'center' })
    y += titleLines.length * 30 + 20

    // 摘要
    pdf.setFontSize(12)
    const summaryHtml = md.render(report.summary || '')
    const summaryText = summaryHtml.replace(/<[^>]*>/g, '')
    const summaryLines = pdf.splitTextToSize(summaryText, contentWidth)
    pdf.text(summaryLines, margin, y)
    y += summaryLines.length * 15 + 20

    // 章节
    for (const section of report.sections) {
      // 检查是否需要新页
      if (y > pdf.internal.pageSize.height - margin) {
        pdf.addPage()
        y = margin
      }

      // 章节标题
      pdf.setFontSize(16)
      pdf.text(section.title || '', margin, y)
      y += 20

      // 章节内容
      pdf.setFontSize(12)
      const contentHtml = md.render(section.content || '')
      const contentText = contentHtml.replace(/<[^>]*>/g, '')
      const contentLines = pdf.splitTextToSize(contentText, contentWidth)
      pdf.text(contentLines, margin, y)
      y += contentLines.length * 15 + 20
    }

    const pdfBuffer = pdf.output('arraybuffer')
    return new Uint8Array(pdfBuffer)
  } catch (error) {
    console.error('Error generating PDF:', error)
    throw error
  }
}
