import logging
from typing import Any
from sqlalchemy.orm import Session
from .llm_router import get_llm_router

LOGGER = logging.getLogger(__name__)

FALLBACK_VISUALS = {
    "science": {
        "concept": "Water Cycle",
        "subject": "science",
        "visualType": "diagram",
        "title": "Interactive Water Cycle Diagram",
        "description": "Scientific process detailing how water cycles through the earth's atmosphere and surface.",
        "elements": {
            "steps": [
                {"stepNum": 1, "title": "Evaporation", "description": "Heat from the Sun causes water from oceans, lakes, and soils to turn into water vapor (gas) and rise into the atmosphere.", "x": 20, "y": 70},
                {"stepNum": 2, "title": "Transpiration", "description": "Plants absorb water through roots and release it as water vapor through small pores (stomata) in their leaves.", "x": 40, "y": 75},
                {"stepNum": 3, "title": "Condensation", "description": "As water vapor rises, it cools and turns back into liquid water droplets, forming clouds and fog.", "x": 50, "y": 25},
                {"stepNum": 4, "title": "Precipitation", "description": "When cloud droplets combine and grow too heavy, they fall back to the Earth as rain, snow, sleet, or hail.", "x": 80, "y": 40},
                {"stepNum": 5, "title": "Collection / Runoff", "description": "Precipitation collects in oceans, rivers, and lakes, or sinks into the ground as groundwater, starting the cycle anew.", "x": 50, "y": 85}
            ]
        }
    },
    "geography": {
        "concept": "Plains vs Plateaus vs Mountains",
        "subject": "geography",
        "visualType": "comparison",
        "title": "Comparison of Landforms",
        "description": "Understand the differences between Plains, Plateaus, and Mountains.",
        "elements": {
            "headers": ["Feature", "Plains", "Plateaus", "Mountains"],
            "rows": [
                {
                    "attribute": "Definition",
                    "values": ["Flat lands with low elevation", "Flat elevated areas with steep sides", "Steep, high lands rising above surroundings"]
                },
                {
                    "attribute": "Elevation",
                    "values": ["Generally below 200m", "Between 300m and 1000m+", "Usually above 1000m+ with peak summit"]
                },
                {
                    "attribute": "Human Use",
                    "values": ["Excellent for agriculture and cities", "Rich in minerals, good for grazing", "Tourism, forestry, water source (glaciers)"]
                },
                {
                    "attribute": "Example",
                    "values": ["Great Plains of India/USA", "Deccan Plateau, Tibet Plateau", "Himalayas, Alps, Rockies"]
                }
            ]
        }
    },
    "history": {
        "concept": "Ancient Kingdoms and Timelines",
        "subject": "history",
        "visualType": "timeline",
        "title": "Key Historical Events",
        "description": "Chronological representation of kingdoms and historical phases.",
        "elements": {
            "events": [
                {"period": "322 BCE - 185 BCE", "title": "Mauryan Empire", "description": "Founded by Chandragupta Maurya, unified most of the Indian subcontinent. Famous Emperor Ashoka spread Buddhism.", "importance": "high"},
                {"period": "320 CE - 550 CE", "title": "Gupta Empire", "description": "Considered the Golden Age of India. Marked by great achievements in science, math, art, and literature.", "importance": "high"},
                {"period": "1206 CE - 1526 CE", "title": "Delhi Sultanate", "description": "Ruled by five consecutive dynasties. Introduced Indo-Islamic architectural styles.", "importance": "medium"},
                {"period": "1526 CE - 1857 CE", "title": "Mughal Empire", "description": "Established by Babur, known for architectural wonders like the Taj Mahal and centralized administrative rules.", "importance": "high"}
            ]
        }
    },
    "mathematics": {
        "concept": "Quadratic Function Visualization",
        "subject": "mathematics",
        "visualType": "math_formula",
        "title": "Quadratic Formula & Graphing",
        "description": "Visualize how the quadratic equation behaves when changing parameters.",
        "elements": {
            "latex": "f(x) = ax^2 + bx + c",
            "variables": [
                {"symbol": "a", "name": "Quadratic coefficient", "description": "Controls direction and width of parabola (positive opens up, negative opens down).", "min": -5, "max": 5, "default": 1},
                {"symbol": "b", "name": "Linear coefficient", "description": "Controls the horizontal position and slope of intersection.", "min": -10, "max": 10, "default": 0},
                {"symbol": "c", "name": "Y-Intercept", "description": "The value where the curve intersects the vertical y-axis.", "min": -10, "max": 10, "default": 0}
            ],
            "plottingExpression": "a * x * x + b * x + c",
            "xRange": [-10.0, 10.0],
            "yRange": [-10.0, 10.0]
        }
    },
    "general": {
        "concept": "Core Concepts",
        "subject": "general",
        "visualType": "comparison",
        "title": "Key Topic Comparison Card",
        "description": "Overview and comparison of key terms discussed in this topic.",
        "elements": {
            "headers": ["Term/Idea", "Key Summary", "Practical Application"],
            "rows": [
                {
                    "attribute": "Primary Subject",
                    "values": ["Main subject matter analyzed by Vidya AI.", "Used for learning contextual curriculum topics."]
                },
                {
                    "attribute": "Detailed Analysis",
                    "values": ["Step-by-step guidance provided in explanation.", "Builds core logic foundation and solving speed."]
                }
            ]
        }
    }
}

FALLBACK_NOTES = {
    "keyConcepts": [
        "Read the question carefully to extract variables, core events, or processes.",
        "Breaking down equations or events step-by-step makes complex subjects highly approachable.",
        "Use visualizations to recall structures during revision."
    ],
    "keyVocabulary": [
        {"term": "Hypothesis", "definition": "A proposed explanation made on the basis of limited evidence as a starting point for further investigation."},
        {"term": "Chronology", "definition": "The arrangement of events or dates in the order of their occurrence."}
    ],
    "formulasOrFacts": [
        "Geography deals with spatial structures, climates, and soil profiles.",
        "History maps human actions and shifts in social hierarchies.",
        "Science details mechanical and chemical pathways governed by laws."
    ],
    "summaryMarkdown": "This topic covers essential foundations designed to build understanding. Review the visual representations and check vocabulary terms for quick revision."
}

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
        "Required elements schema: {\"locations\": [{\"label\": \"Name\", \"description\": \"Details\", \"x\": integer 0-100, \"y\": integer 0-100}]}\n"
        "2. 'timeline': Best for history timelines, historical events, freedom fighters epochs, or sequential evolutionary cycles. "
        "Required elements schema: {\"events\": [{\"period\": \"Year/Range\", \"title\": \"Event Name\", \"description\": \"Details\", \"importance\": \"high\"|\"medium\"|\"low\"}]}\n"
        "3. 'comparison': Best for comparing concepts (e.g. Plains vs Mountains, Ancient Kingdom vs another, DNA vs RNA). "
        "Required elements schema: {\"headers\": [\"Attribute\", \"Concept A\", \"Concept B\"], \"rows\": [{\"attribute\": \"Feature\", \"values\": [\"valA\", \"valB\"]}]}\n"
        "4. 'diagram': Best for science processes (water cycle, photosynthesis, heart circulation) where nodes connect sequentially. "
        "Required elements schema: {\"steps\": [{\"stepNum\": integer, \"title\": \"Step Name\", \"description\": \"Details\", \"x\": integer 0-100, \"y\": integer 0-100}]}\n"
        "5. 'labeled_visual': Best for anatomical diagrams (human heart, cell structure) or detailed layouts. "
        "Required elements schema: {\"hotspots\": [{\"label\": \"Part Name\", \"description\": \"Functional description\", \"x\": integer 0-100, \"y\": integer 0-100}]}\n"
        "6. 'math_formula': Best for math geometry, algebra formulas, or physics equations. "
        "Required elements schema: {\"latex\": \"LaTeX string\", \"variables\": [{\"symbol\": \"x\", \"name\": \"Var\", \"description\": \"desc\", \"min\": num, \"max\": num, \"default\": num}], \"plottingExpression\": \"JS compatible expression e.g. a * x * x\", \"xRange\": [num, num], \"yRange\": [num, num]}\n\n"
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

    # Fallback generation
    fallback_vl = FALLBACK_VISUALS.get(subject_normalized, FALLBACK_VISUALS["general"])
    fallback_sn = dict(FALLBACK_NOTES)

    # Dynamically tweak fallback to fit question text context slightly if possible
    concept_detected = question_text[:40] + "..." if len(question_text) > 40 else question_text
    
    # Return structured fallback
    return {
        "visualLearning": {
            **fallback_vl,
            "concept": concept_detected,
            "description": f"Visual helper customized for the question: '{question_text[:120]}...'"
        },
        "studyNotes": {
            **fallback_sn,
            "summaryMarkdown": f"This study note is summarized from the homework question regarding: **{concept_detected}**. \n\n{detailed_explanation[:500]}..." if detailed_explanation else fallback_sn["summaryMarkdown"]
        }
    }
