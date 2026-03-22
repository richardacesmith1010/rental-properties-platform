import type { DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import type { ManagerInvoicePdfData } from "@/lib/manager-payments";
import { InvoicePdfDocument, createInvoicePdfDocument } from "./invoice-template";

interface ManagerInvoiceDocumentProps {
  invoice: ManagerInvoicePdfData;
}

export const ManagerInvoicePdfDocument = InvoicePdfDocument;

export function createManagerInvoicePdfDocument(
  props: ManagerInvoiceDocumentProps
): ReactElement<DocumentProps> {
  return createInvoicePdfDocument(props);
}
