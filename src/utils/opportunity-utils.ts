import {PrismaClient, QuestionType} from "@prisma/client";
import {prisma} from "@/utils/prisma-utils";
import {gql} from "@apollo/client";
import {runQuery} from "@/utils/graphql-utils";
import {Opportunity} from "@/types/project-types";
import {getFullSurveyResponses, getQuestions} from "@/utils/questionnaire-utils";
import {AnalysisRow, QuestionStructure} from "@/types/question-types";
import {Answer} from "@/components/questions/QuestionnaireInner";

export async function getSurveyResponses(opportunityId: number) {
    const opportunity = await prisma.opportunity.findUnique({
        where: {
            id: opportunityId
        },
        select: {
            slots: {
                select: {
                    id: true
                }
            }
        }
    });
    const slotIds = opportunity?.slots.map(slot => slot.id);

    const slots = await prisma.slot.findMany({
        where: {
            id: {
                in: slotIds
            }
        },
        select: {
            name: true,
            surveyResponses: {
                select: {
                    applicationId: true,
                    updatedAt: true,
                }
            }
        }
    });
    const surveyResponses: {
        applicationId: number,
        slotName: string,
        updatedAt: Date
    }[] = [];
    slots.forEach(slot => {
        slot.surveyResponses.forEach(surveyResponse => {
            surveyResponses.push({
                applicationId: surveyResponse.applicationId,
                slotName: slot.name,
                updatedAt: surveyResponse.updatedAt
            });
        });
    });

   return surveyResponses;
}

export async function getOpportunity(opportunityId: number): Promise<Opportunity> {
    const query = gql`
        {
            opportunity(id: "${opportunityId}") {
                id
                title
                location
                sdg_info {
                    sdg_target {
                        goal_index
                    }
                }
            }
        }
    `

    const queryResponse = await runQuery(query);
    return {
        id: queryResponse.opportunity.id,
        name: queryResponse.opportunity.title,
        location: queryResponse.opportunity.location,
        sdg: queryResponse.opportunity.sdg_info.sdg_target.goal_index
    };
}

export async function getOpportunityAnalysis(opportunityId: number): Promise<AnalysisRow[]> {
    const opportunity = await getOpportunity(opportunityId);
    const opportunityName = opportunity.name;
    const questions: QuestionStructure[] = await getQuestions(opportunityName);

    type AnalysisRecord = {
        sumInitialCount: number,
        sumInitialScore: number,
        sumFinalCount: number,
        sumFinalScore: number
    }

    const analysis: { [id: number] : AnalysisRecord} = {};
    for (const question of questions) {
        analysis[question.id] = {
            sumInitialCount: 0,
            sumInitialScore: 0,
            sumFinalCount: 0,
            sumFinalScore: 0
        };
    }

    const surveyResponses = await getFullSurveyResponses(opportunityId);
    for (const response of surveyResponses) {
        for (const answer of response.answers) {
            if (!analysis[answer.questionId]) continue;

            if (answer.type == QuestionType.INITIAL) {
                analysis[answer.questionId].sumInitialCount += response.initialCount;
                analysis[answer.questionId].sumInitialScore += response.initialCount * answer.answer;
            } else if (answer.type == QuestionType.FINAL) {
                analysis[answer.questionId].sumFinalCount += response.finalCount;
                analysis[answer.questionId].sumFinalScore += response.finalCount * answer.answer;
            }
        }
    }

    const analysisRows: AnalysisRow[] = [];
    for (const question of questions) {
        let totalInitialCount = NaN;
        let averageInitialScore = NaN;
        let totalFinalCount = NaN;
        let averageFinalScore = NaN;

        if (question.initial) {
            totalInitialCount = analysis[question.id].sumInitialCount;
            if (totalInitialCount > 0) averageInitialScore = analysis[question.id].sumInitialScore / totalInitialCount;
        }

        if (question.final) {
            totalFinalCount = analysis[question.id].sumFinalCount;
            if (totalFinalCount > 0) averageFinalScore = analysis[question.id].sumFinalScore / totalFinalCount;
        }

        analysisRows.push({
            id: question.id,
            question: question.text,
            totalInitialCount: totalInitialCount,
            averageInitialScore: averageInitialScore,
            totalFinalCount: totalFinalCount,
            averageFinalScore: averageFinalScore,
            change: averageFinalScore - averageInitialScore
        });
    }

    return analysisRows;
}

export async function getOpportunities() {
    const opportunities = await prisma.opportunity.findMany({
        select: {
            id: true,
            name: true,
            project: {
                select: {
                    id: true,
                    sdg: true
                }
            },
            slots: {
                select: {
                    surveyResponses: {
                        select: {
                            applicationId: true
                        }
                    }
                }
            }
        }
    });

    const result: {
        id: number,
        name: string,
        project: {
            id: number,
            sdg: number
        }
        responsesCount: number
    }[] = [];

    for (const opportunity of opportunities) {
        const responsesCount = opportunity.slots.reduce((acc, slot) => {
            return acc + slot.surveyResponses.length;
        }, 0);

        result.push({
            id: opportunity.id,
            name: opportunity.name,
            project: {
                id: opportunity.project.id,
                sdg: opportunity.project.sdg
            },
            responsesCount: responsesCount
        });
    }

    return result;
}

export async function getHostEntity(opportunityId: number) {
    const query = gql`
        {
            opportunity(id: "${opportunityId}") {
                host_lc {
                    id
                    name
                }
                home_mc {
                    id
                    name
                }
            }
        }
    `

    const queryResponse = await runQuery(query);
    return {
        lc: {
            id: queryResponse.opportunity.host_lc.id,
            name: queryResponse.opportunity.host_lc.name
        },
        mc: {
            id: queryResponse.opportunity.home_mc.id,
            name: queryResponse.opportunity.home_mc.name
        }
    };
}

export async function getLocation(opportunityId: number) {
    const query = gql`
        {
            opportunity(id: "${opportunityId}") {
                location
            }
        }
    `

    const queryResponse = await runQuery(query);
    return queryResponse.opportunity.location;
}