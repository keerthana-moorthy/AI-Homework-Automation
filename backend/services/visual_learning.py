import logging
import json
from typing import Any
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

    # Define system instruction with strict routing matrix and context isolation
    system_prompt = (
        "You are an intelligent educational Visual Learning Engine.\n"
        "Analyze the provided homework question, subject, and detailed explanation.\n"
        "Your task is to generate the most appropriate visual representation based strictly on the current homework context.\n"
        "Do NOT reuse visuals, topics, or generated content from other sessions. Context isolation is mandatory.\n\n"
        "Based on the subject, you MUST select one of the following dynamic visual tools and provide its corresponding JSON schema.\n\n"
        "ROUTING MATRIX:\n"
        "- Mathematics -> \"geogebra\" (Generates a math expression to be plotted)\n"
        "- Geography -> \"openstreetmap\" (Generates geographic coordinates and markers for maps)\n"
        "- History -> \"timelinejs\" (Generates historical timeline events)\n"
        "- Computer Science, Social Science, English, Economics -> \"mermaid\" (Generates Mermaid.js syntax for flowcharts, mind maps, architecture diagrams)\n"
        "- Biology, Physics, Chemistry, Environmental Science, General Science -> \"ai_image\" (Generates an educational diagram or image generation prompt)\n\n"
        "OUTPUT JSON SCHEMA:\n"
        "The output must be a single JSON object with EXACTLY TWO top-level keys: \"visualLearning\" and \"studyNotes\".\n\n"
        "For \"visualLearning\":\n"
        "{\n"
        "  \"tool\": \"mermaid\" | \"geogebra\" | \"openstreetmap\" | \"timelinejs\" | \"ai_image\",\n"
        "  \"subject\": \"Detected Subject\",\n"
        "  \"topic\": \"Detected Topic\",\n"
        "  \"payload\": { ... tool specific payload ... }\n"
        "}\n\n"
        "PAYLOAD FORMATS:\n"
        "1. mermaid: {\"code\": \"graph TD\\nA[Start] --> B[End]\"}\n"
        "2. geogebra: {\"expression\": \"y = x^2\", \"description\": \"Graph of a parabola\"}\n"
        "3. openstreetmap: {\"center\": [latitude, longitude], \"zoom\": 5, \"markers\": [{\"position\": [lat, lng], \"label\": \"Location Name\", \"description\": \"Details\"}]}\n"
        "4. timelinejs: {\"events\": [{\"year\": \"1947\", \"title\": \"Event\", \"description\": \"Details\"}]}\n"
        "5. ai_image: {\"prompt\": \"Detailed description of the diagram to generate\", \"labels\": [\"Part 1\", \"Part 2\"]}\n\n"
        "For \"studyNotes\":\n"
        "{\n"
        "  \"keyConcepts\": [\"String array of core extracted concepts\"],\n"
        "  \"keyVocabulary\": [{\"term\": \"Word\", \"definition\": \"Def\"}],\n"
        "  \"formulasOrFacts\": [\"String array of facts\"],\n"
        "  \"summaryMarkdown\": \"Brief markdown summary of the explanation\"\n"
        "}\n\n"
        "IMPORTANT RULES:\n"
        "- MUST ONLY output valid JSON. No markdown wrappers around the JSON.\n"
        "- Do NOT use hardcoded examples or placeholder static data.\n"
        "- Ensure geography doesn't generate math, history doesn't generate science, etc.\n"
    )

    user_prompt = (
        f"Subject: {subject_normalized}\n"
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
                temperature=0.2
            )
            if raw and "visualLearning" in raw and "studyNotes" in raw:
                vl = raw["visualLearning"]
                sn = raw["studyNotes"]
                
                # Validation check for new schema
                if "tool" in vl and "payload" in vl:
                    return {
                        "visualLearning": vl,
                        "studyNotes": sn
                    }
        except Exception as e:
            LOGGER.error("Error generating visual learning content from LLM: %s", e)

    # Dynamic Fallback generation based strictly on homework text
    concept_detected = question_text[:40] + "..." if len(question_text) > 40 else question_text
    
    fallback_vl = {
        "tool": "mermaid",
        "subject": subject_normalized,
        "topic": "Overview",
        "payload": {
            "code": f"graph TD\\n  A[Homework Question] --> B[{json.dumps(concept_detected).strip('\"')}]"
        }
    }
    
    fallback_sn = {
        "keyConcepts": ["Context could not be fully analyzed. Please retry."],
        "keyVocabulary": [{"term": "Topic Concept", "definition": concept_detected}],
        "formulasOrFacts": ["Review the primary explanation for specific details."],
        "summaryMarkdown": f"This study note is summarized from the homework question regarding: **{concept_detected}**."
    }

    return {
        "visualLearning": fallback_vl,
        "studyNotes": fallback_sn
    }
