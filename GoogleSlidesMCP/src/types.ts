/*
 * Types for Google Slides API functions.
 */
type ParagraphSlideParam = {
  kind: "Paragraph";
  body: string;
};

type GeneralSummarySlideParam = {
  kind: "GeneralSummary";
  foundedYear: number;
  arr: number;
  industry: string;
  burnRate: number;
  exitStrategy: string;
};

type InvestmentDetails = {
  kind: "InvestmentDetails";
  dealStatus: string;
  fundingStage: string;
  investmentAmount: number;
  investmentDate: string;
};

export type AddSlideParam = {
  companyName: string;
  slideType: GeneralSummarySlideParam | ParagraphSlideParam | InvestmentDetails;
  presentationId?: string;
};

export type CompanyData = {
  companyName: string;
  location: string;
  foundedYear: number;
  arr: number;
  industry: string;
  burnRate: number;
  exitStrategy: string;
  dealStatus: string;
  fundingStage: string;
  investmentAmount: number;
  investmentDate: string;
  keyMetrics: string;
  presentationId?: string;
};

/**
 * Types for recieving Notion data
 */
//Represents a single property in first_properties
// export interface NotionProperty {
//   property_id: string;
//   type: "title" | "select" | "number";
//   value: number;
//   formatted?: string;
// }

//TODO: This structure will change depending on how you are prompting the LLM. Update this interface to fit your response JSON
//Full JSON structure of NotionMCP response
export interface NotionPayload {
  company: string;
  arr: number;
  industry: string;
  burnRate: number;
  exitStrategy: string;
  database_id?: string;
}
