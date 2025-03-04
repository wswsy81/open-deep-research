import React from 'react'
import { ReportContent } from './report-content'

export default async function ReportPage({ params }: any) {
  return <ReportContent id={params.id} />
}
