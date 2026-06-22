import logging
from typing import Any
from sqlalchemy.orm import Session
from .llm_router import get_llm_router

LOGGER = logging.getLogger(__name__)

def generate_visual_learning_and_notes(
    subject_id: str | None,
    question_text: str,
    detailed_explanation: str
) -> dict[str, Any]:
    """
    Analyzes the homework question and detailed explanation to detect concepts 
    and construct structured payloads for interactive visual modules and notes.
    """
    subject_normalized = (subject_id or "general").lower().strip()
    if subject_normalized in {"maths", "mathematics"}:
        subject_normalized = "mathematics"
    elif subject_normalized in {"gk", "general_knowledge", "general knowledge"}:
        subject_normalized = "general"
    elif subject_normalized not in {"science", "geography", "history", "mathematics"}:
        subject_normalized = "general"

    # Define system instruction
    system_prompt = (
        "You are an educational AI visual content and notes builder. "
        "Analyze the provided homework question, subject, and detailed explanation, and return a JSON object containing "
        "visualLearning and studyNotes. "
        "Choose the most appropriate visualType for this topic:\n"
        "1. 'map': Best for geography places (plains, deserts, rivers, plates) or historical paths (kingdom borders, explorers). "
        "Required elements schema: {\"locations\": [{\"label\": \"Name\", \"icon\": \"relevant emoji\", \"description\": \"Details\", \"x\": integer 0-100, \"y\": integer 0-100}]}\n"
        "2. 'timeline': Best for history timelines, historical events, freedom fighters epochs, or sequential evolutionary cycles. "
        "Required elements schema: {\"events\": [{\"period\": \"Year/Range\", \"icon\": \"relevant emoji\", \"title\": \"Event Name\", \"description\": \"Details\", \"importance\": \"high\"|\"medium\"|\"low\"}]}\n"
        "3. 'comparison': Best for comparing concepts (e.g. Plains vs Mountains, Ancient Kingdom vs another, DNA vs RNA). "
        "Required elements schema: {\"headers\": [\"Attribute\", \"Concept A\", \"Concept B\"], \"rows\": [{\"attribute\": \"Feature\", \"values\": [\"valA\", \"valB\"]}]}\n"
        "4. 'diagram': Best for science processes (water cycle, photosynthesis, heart circulation) where nodes connect sequentially. "
        "Required elements schema: {\"steps\": [{\"stepNum\": integer, \"icon\": \"relevant single emoji representing this stage (e.g. ☀️ for sun/heat, ☁️ for clouds, 💧 for water, 🌿 for plant/transpiration, 🌧️ for rain, 🔬 for microscopy, 🧬 for DNA)\", \"title\": \"Step Name\", \"description\": \"Details\", \"x\": integer 0-100, \"y\": integer 0-100}]}\n"
        "5. 'labeled_visual': Best for anatomical diagrams (human heart, cell structure) or detailed layouts. "
        "Required elements schema: {\"hotspots\": [{\"label\": \"Part Name\", \"icon\": \"relevant emoji\", \"description\": \"Functional description\", \"x\": integer 0-100, \"y\": integer 0-100}]}\n"
        "6. 'math_formula': Best for math geometry, algebra formulas, or physics equations. "
        "Required elements schema: {\"latex\": \"LaTeX string\", \"variables\": [{\"symbol\": \"x\", \"name\": \"Var\", \"description\": \"desc\", \"min\": num, \"max\": num, \"default\": num}], \"plottingExpression\": \"JS compatible expression e.g. a * x * x\", \"xRange\": [num, num], \"yRange\": [num, num]}\n\n"
        "IMPORTANT: For diagram steps and labeled_visual hotspots, always include a relevant single emoji in the 'icon' field that visually represents that specific stage or component. "
        "Provide rich educational detail, matching the subject rules. "
        "The response JSON must contain ONLY the top-level keys 'visualLearning' and 'studyNotes'. Do not include extra wrappers."
    )

    user_prompt = (
        f"Subject: {subject_id}\n"
        f"Question: {question_text}\n"
        f"Detailed Explanation: {detailed_explanation}\n\n"
        "Generate the custom interactive visual learning payload and comprehensive revision study notes."
    )

    router = get_llm_router()
    if router.configured:
        try:
            raw = router.generate_json(
                task="explanation",
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=0.3
            )
            if raw and "visualLearning" in raw and "studyNotes" in raw:
                # Basic validation
                vl = raw["visualLearning"]
                sn = raw["studyNotes"]
                if all(k in vl for k in ["concept", "subject", "visualType", "title", "elements"]) and \
                   all(k in sn for k in ["keyConcepts", "keyVocabulary", "formulasOrFacts"]):
                    return {
                        "visualLearning": vl,
                        "studyNotes": sn
                    }
        except Exception as e:
            LOGGER.error("Error generating visual learning content from LLM: %s", e)

    # Dynamic Fallback generation based strictly on homework text
    concept_detected = question_text[:40] + "..." if len(question_text) > 40 else question_text
    
    fallback_vl = {
        "concept": concept_detected,
        "subject": subject_normalized,
        "visualType": "comparison",
        "title": "Key Concepts Overview",
        "description": f"Visual summary for: '{concept_detected}'",
        "elements": {
            "headers": ["Term/Idea", "Summary", "Context"],
            "rows": [
                {
                    "attribute": "Main Topic",
                    "values": [concept_detected, "Derived from homework question."]
                },
                {
                    "attribute": "Details",
                    "values": ["See explanation for more info.", "Used to build core understanding."]
                }
            ]
        }
    }
    
    fallback_sn = {
        "keyConcepts": [
            "Read the question carefully to extract variables and core events.",
            "Breaking down concepts step-by-step makes complex subjects highly approachable."
        ],
        "keyVocabulary": [
            {"term": "Topic Concept", "definition": concept_detected}
        ],
        "formulasOrFacts": [
            "Review the primary explanation for specific details."
        ],
        "summaryMarkdown": f"This study note is summarized from the homework question regarding: **{concept_detected}**. \n\n{detailed_explanation[:500]}..." if detailed_explanation else "Review the detailed explanation provided."
    }

    # Return structured fallback
    return {
        "visualLearning": fallback_vl,
        "studyNotes": fallback_sn
    }
