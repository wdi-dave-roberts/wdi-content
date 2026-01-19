#!/bin/bash
set -e

# Fabric Research Spike - Auto-discover and score content on a topic
# Usage: ./scripts/fabric-research.sh "topic" [options]

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Defaults
COUNT=10
SEARCH_ENGINE="ddgs"
YOUTUBE=true
ARTICLES=true
OUTPUT_DIR=""
YES=false
TOPIC=""

# Model rotation - alternate between providers to spread rate limits
# Use just model names (fabric resolves the vendor automatically)
MODELS=("claude-sonnet-4-5" "gpt-4o")
MODEL_INDEX=0

# Help text
show_help() {
  cat << EOF
${BOLD}Fabric Research Spike${NC} - Auto-discover and score content on a topic

${BOLD}Usage:${NC}
  $(basename "$0") "topic" [options]

${BOLD}Options:${NC}
  --count N        Results per source (default: 10)
  --youtube-only   Skip article search
  --articles-only  Skip YouTube search
  --search-engine  Article search: ddgs (default) or brave
  --models M1,M2   Comma-separated models to rotate (spreads rate limits)
                   Default: claude-sonnet-4-5,gpt-4o
  --output-dir     Override output directory
  --yes            Skip confirmation prompts
  --help           Show this help

${BOLD}Examples:${NC}
  $(basename "$0") "AI agents"
  $(basename "$0") "AI agents" --count 20
  $(basename "$0") "AI agents" --youtube-only
  $(basename "$0") "AI agents" --models "gpt-4o,claude-haiku-4-5"

${BOLD}Prerequisites:${NC}
  pip install yt-dlp ddgs
  go install github.com/danielmiessler/fabric@latest
  fabric --setup

EOF
  exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --count) COUNT="$2"; shift 2 ;;
    --youtube-only) ARTICLES=false; shift ;;
    --articles-only) YOUTUBE=false; shift ;;
    --search-engine) SEARCH_ENGINE="$2"; shift 2 ;;
    --models) IFS=',' read -ra MODELS <<< "$2"; shift 2 ;;
    --output-dir) OUTPUT_DIR="$2"; shift 2 ;;
    --yes) YES=true; shift ;;
    --help|-h) show_help ;;
    -*) echo "Unknown option: $1"; exit 1 ;;
    *) TOPIC="$1"; shift ;;
  esac
done

# Validate topic
if [[ -z "$TOPIC" ]]; then
  echo -e "${RED}Error: Topic is required${NC}"
  echo "Usage: $(basename "$0") \"topic\" [options]"
  exit 1
fi

# Check prerequisites
check_prereqs() {
  local missing=()

  if [[ "$YOUTUBE" == true ]] && ! command -v yt-dlp &> /dev/null; then
    missing+=("yt-dlp (pip install yt-dlp)")
  fi

  if [[ "$ARTICLES" == true && "$SEARCH_ENGINE" == "ddgs" ]] && ! command -v ddgs &> /dev/null; then
    missing+=("ddgs (pip install ddgs)")
  fi

  if [[ "$ARTICLES" == true && "$SEARCH_ENGINE" == "brave" && -z "$BRAVE_API_KEY" ]]; then
    missing+=("BRAVE_API_KEY environment variable")
  fi

  if ! command -v fabric &> /dev/null; then
    missing+=("fabric (go install github.com/danielmiessler/fabric@latest)")
  fi

  if ! command -v jq &> /dev/null; then
    missing+=("jq (apt install jq / brew install jq)")
  fi

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo -e "${RED}Missing prerequisites:${NC}"
    for item in "${missing[@]}"; do
      echo "  - $item"
    done
    exit 1
  fi
}

check_prereqs

# Slugify topic for default output dir
slugify() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-' | sed 's/--*/-/g' | sed 's/^-//;s/-$//'
}

SLUG=$(slugify "$TOPIC")

# Default output directory
if [[ -z "$OUTPUT_DIR" ]]; then
  OUTPUT_DIR="projects/${SLUG}-research"
fi

# Confirm output location
echo -e "${BOLD}Researching:${NC} $TOPIC"
echo -e "${BOLD}Models:${NC} ${MODELS[*]}"
echo -e "${BOLD}Output directory:${NC} $OUTPUT_DIR/"

if [[ "$YES" != true ]]; then
  read -p "  → Confirm? [Y/n/change path]: " confirm
  case $confirm in
    n|N) echo "Aborted."; exit 0 ;;
    "") ;; # Empty = yes
    *) OUTPUT_DIR="$confirm" ;;
  esac
fi

mkdir -p "$OUTPUT_DIR"

# Initialize files
MD_FILE="$OUTPUT_DIR/results.md"
JSON_FILE="$OUTPUT_DIR/results.json"
TIMESTAMP=$(date -Iseconds)

# Start markdown
cat > "$MD_FILE" << EOF
# ${TOPIC} Research
Generated: $(date "+%Y-%m-%d %H:%M")

EOF

# JSON arrays for collecting results
declare -a JSON_RESULTS=()

# Tier emoji mapping
tier_emoji() {
  case $1 in
    S) echo "🏆" ;;
    A) echo "⭐" ;;
    B) echo "👍" ;;
    C) echo "📄" ;;
    D) echo "⚠️" ;;
    *) echo "❓" ;;
  esac
}

# Parse Fabric output for tier and score
parse_rating() {
  local content="$1"
  local tier score

  # Look for tier (S, A, B, C, D)
  tier=$(echo "$content" | grep -oP '(?i)(tier|rating|grade)[:\s]*\K[SABCD]' | head -1 | tr '[:lower:]' '[:upper:]')
  [[ -z "$tier" ]] && tier=$(echo "$content" | grep -oP '\b[SABCD][-\s]?[Tt]ier' | head -1 | grep -oP '[SABCD]' | tr '[:lower:]' '[:upper:]')
  [[ -z "$tier" ]] && tier="?"

  # Look for score (number out of 100)
  score=$(echo "$content" | grep -oP '(?i)(score|rating)[:\s]*\K\d+' | head -1)
  [[ -z "$score" ]] && score=$(echo "$content" | grep -oP '\b\d{1,3}(/100|%)' | head -1 | grep -oP '\d+')
  [[ -z "$score" ]] && score="0"

  echo "$tier|$score"
}

# Parse wisdom sections
parse_wisdom() {
  local content="$1"
  local section="$2"

  # Extract section (e.g., IDEAS, INSIGHTS, QUOTES)
  echo "$content" | awk -v sec="$section" '
    BEGIN { found=0; IGNORECASE=1 }
    /^#+\s*'"$section"'/ || /^'"$section"':?$/ { found=1; next }
    found && /^#+\s*[A-Z]/ { found=0 }
    found && /^[A-Z]+:?$/ { found=0 }
    found && NF > 0 { print }
  '
}

# Get next model (rotates through MODELS array)
get_next_model() {
  local model="${MODELS[$MODEL_INDEX]}"
  MODEL_INDEX=$(( (MODEL_INDEX + 1) % ${#MODELS[@]} ))
  echo "$model"
}

# Process a single item through Fabric
process_item() {
  local source="$1"    # youtube or article
  local url="$2"
  local title="$3"
  local extra="$4"     # duration for youtube, domain for articles

  local wisdom rating tier score
  local model=$(get_next_model)

  # Get wisdom extraction (use rotating model)
  if [[ "$source" == "youtube" ]]; then
    wisdom=$(fabric -y "$url" --pattern extract_wisdom --model "$model" 2>/dev/null || echo "Error extracting wisdom")
  else
    wisdom=$(curl -sL "$url" | fabric --pattern extract_wisdom --model "$model" 2>/dev/null || echo "Error extracting wisdom")
  fi

  # Get rating (use next model in rotation)
  local rating_model=$(get_next_model)
  rating=$(echo "$wisdom" | fabric --pattern rate_content --model "$rating_model" 2>/dev/null || echo "Tier: ? Score: 0")

  # Parse tier and score
  IFS='|' read -r tier score <<< "$(parse_rating "$rating")"

  # Parse wisdom sections
  local summary ideas insights quotes
  summary=$(echo "$wisdom" | parse_wisdom "SUMMARY" | head -5)
  ideas=$(echo "$wisdom" | parse_wisdom "IDEAS")
  insights=$(echo "$wisdom" | parse_wisdom "INSIGHTS")
  quotes=$(echo "$wisdom" | parse_wisdom "QUOTES")

  # One-liner takeaway
  local takeaway
  takeaway=$(echo "$summary" | head -1 | sed 's/^[-*]\s*//')
  [[ -z "$takeaway" ]] && takeaway="No summary available"

  # Output result indicator
  echo -e " ${GREEN}${tier}${NC} (${score})"

  # Build JSON object
  local json_obj
  json_obj=$(jq -n \
    --arg source "$source" \
    --arg tier "$tier" \
    --argjson score "${score:-0}" \
    --arg title "$title" \
    --arg url "$url" \
    --arg extra "$extra" \
    --arg summary "$summary" \
    --arg ideas "$ideas" \
    --arg insights "$insights" \
    --arg quotes "$quotes" \
    '{
      source: $source,
      tier: $tier,
      score: $score,
      title: $title,
      url: $url,
      meta: $extra,
      wisdom: {
        summary: $summary,
        ideas: $ideas,
        insights: $insights,
        quotes: $quotes
      }
    }')

  # Store for later
  JSON_RESULTS+=("$json_obj")

  # Also write to temp file for markdown generation
  echo "---ITEM---" >> "$OUTPUT_DIR/.temp_results"
  echo "source:$source" >> "$OUTPUT_DIR/.temp_results"
  echo "tier:$tier" >> "$OUTPUT_DIR/.temp_results"
  echo "score:$score" >> "$OUTPUT_DIR/.temp_results"
  echo "title:$title" >> "$OUTPUT_DIR/.temp_results"
  echo "url:$url" >> "$OUTPUT_DIR/.temp_results"
  echo "meta:$extra" >> "$OUTPUT_DIR/.temp_results"
  echo "takeaway:$takeaway" >> "$OUTPUT_DIR/.temp_results"
  echo "---IDEAS---" >> "$OUTPUT_DIR/.temp_results"
  echo "$ideas" >> "$OUTPUT_DIR/.temp_results"
  echo "---INSIGHTS---" >> "$OUTPUT_DIR/.temp_results"
  echo "$insights" >> "$OUTPUT_DIR/.temp_results"
  echo "---END---" >> "$OUTPUT_DIR/.temp_results"
}

# Initialize temp file
> "$OUTPUT_DIR/.temp_results"

# Counters
ITEM_NUM=0
TOTAL_ITEMS=0
declare -A TIER_COUNTS=([S]=0 [A]=0 [B]=0 [C]=0 [D]=0 [?]=0)

# YouTube Discovery
if [[ "$YOUTUBE" == true ]]; then
  echo -e "\n${CYAN}Finding YouTube videos...${NC}"

  # Get videos
  yt_results=$(yt-dlp "ytsearch${COUNT}:${TOPIC}" \
    --print "%(id)s|%(title)s|%(duration_string)s" \
    --no-download 2>/dev/null || true)

  yt_count=$(echo "$yt_results" | grep -c '^' || echo 0)
  echo -e "  found ${GREEN}${yt_count}${NC} videos"
  TOTAL_ITEMS=$((TOTAL_ITEMS + yt_count))

  while IFS='|' read -r id title duration; do
    [[ -z "$id" ]] && continue
    ITEM_NUM=$((ITEM_NUM + 1))

    echo -ne "[${ITEM_NUM}] Processing: \"${title:0:40}...\" (youtube)..."

    process_item "youtube" "https://youtube.com/watch?v=${id}" "$title" "$duration"

    # Count tier
    tier=$(grep "^tier:" "$OUTPUT_DIR/.temp_results" | tail -1 | cut -d: -f2 | tr -d '\n\r')
    [[ -z "$tier" ]] && tier="?"
    TIER_COUNTS["$tier"]=$((TIER_COUNTS["$tier"] + 1))

  done <<< "$yt_results"
fi

# Article Discovery
if [[ "$ARTICLES" == true ]]; then
  echo -e "\n${CYAN}Finding web articles...${NC}"

  if [[ "$SEARCH_ENGINE" == "brave" ]]; then
    # Brave Search API
    article_results=$(curl -s \
      -H "Accept: application/json" \
      -H "X-Subscription-Token: $BRAVE_API_KEY" \
      "https://api.search.brave.com/res/v1/web/search?q=$(echo "$TOPIC" | jq -sRr @uri)&count=${COUNT}" \
      | jq -r '.web.results[] | "\(.url)|\(.title)|\(.url | split("/")[2])"')
  else
    # DDGS - writes to file, so use temp file
    DDGS_TEMP="$OUTPUT_DIR/.ddgs_results.json"
    ddgs text -q "$TOPIC" -m "$COUNT" -o "$DDGS_TEMP" 2>/dev/null || true
    if [[ -f "$DDGS_TEMP" ]]; then
      article_results=$(jq -r '.[] | "\(.href)|\(.title)|\(.href | split("/")[2])"' "$DDGS_TEMP" 2>/dev/null || true)
      rm -f "$DDGS_TEMP"
    else
      article_results=""
    fi
  fi

  article_count=$(echo "$article_results" | grep -c '^' || echo 0)
  echo -e "  found ${GREEN}${article_count}${NC} articles"
  TOTAL_ITEMS=$((TOTAL_ITEMS + article_count))

  while IFS='|' read -r url title domain; do
    [[ -z "$url" ]] && continue
    ITEM_NUM=$((ITEM_NUM + 1))

    echo -ne "[${ITEM_NUM}] Processing: \"${title:0:40}...\" (article)..."

    process_item "article" "$url" "$title" "$domain"

    # Count tier
    tier=$(grep "^tier:" "$OUTPUT_DIR/.temp_results" | tail -1 | cut -d: -f2 | tr -d '\n\r')
    [[ -z "$tier" ]] && tier="?"
    TIER_COUNTS["$tier"]=$((TIER_COUNTS["$tier"] + 1))

  done <<< "$article_results"
fi

# Generate sorted markdown output
echo -e "\n${CYAN}Generating output files...${NC}"

# Process temp file into sorted markdown
for tier in S A B C D; do
  tier_items=$(grep -c "^tier:$tier" "$OUTPUT_DIR/.temp_results" 2>/dev/null | head -1 || echo "0")
  tier_items=${tier_items//[^0-9]/}
  [[ -z "$tier_items" || "$tier_items" == "0" ]] && continue

  echo "" >> "$MD_FILE"
  echo "## $(tier_emoji $tier) ${tier}-Tier Content" >> "$MD_FILE"
  echo "" >> "$MD_FILE"

  # Extract items of this tier
  awk -v tier="$tier" '
    /^---ITEM---/ { item=""; in_item=1; next }
    /^---END---/ {
      if (item_tier == tier) print item
      in_item=0; item_tier=""
      next
    }
    in_item && /^tier:/ { item_tier=substr($0, 6) }
    in_item { item = item $0 "\n" }
  ' "$OUTPUT_DIR/.temp_results" | while read -r line; do
    # Parse each item
    case "$line" in
      source:*) src="${line#source:}" ;;
      title:*) title="${line#title:}" ;;
      url:*) url="${line#url:}" ;;
      meta:*) meta="${line#meta:}" ;;
      score:*) score="${line#score:}" ;;
      takeaway:*) takeaway="${line#takeaway:}" ;;
      ---IDEAS---) in_ideas=true; ideas="" ;;
      ---INSIGHTS---) in_ideas=false; in_insights=true; insights="" ;;
      ---END---)
        echo "### $title" >> "$MD_FILE"
        echo "- **Source:** ${src^} ($meta)" >> "$MD_FILE"
        echo "- **Score:** ${score}/100" >> "$MD_FILE"
        echo "- **Key Takeaway:** $takeaway" >> "$MD_FILE"
        echo "- **URL:** $url" >> "$MD_FILE"
        echo "" >> "$MD_FILE"
        if [[ -n "$ideas" ]]; then
          echo "**Ideas:**" >> "$MD_FILE"
          echo "$ideas" >> "$MD_FILE"
          echo "" >> "$MD_FILE"
        fi
        ;;
      *)
        if [[ "$in_ideas" == true ]]; then
          ideas="$ideas$line\n"
        elif [[ "$in_insights" == true ]]; then
          insights="$insights$line\n"
        fi
        ;;
    esac
  done
done

# Simpler markdown generation - iterate through temp file
generate_markdown_by_tier() {
  local target_tier="$1"
  local has_items=false
  local current_block=""
  local in_block=false
  local current_tier=""

  while IFS= read -r line; do
    if [[ "$line" == "---ITEM---" ]]; then
      in_block=true
      current_block=""
      continue
    fi

    if [[ "$line" == "---END---" ]]; then
      if [[ "$current_tier" == "$target_tier" && -n "$current_block" ]]; then
        if [[ "$has_items" == false ]]; then
          echo ""
          echo "## $(tier_emoji $target_tier) ${target_tier}-Tier Content"
          echo ""
          has_items=true
        fi
        echo "$current_block"
      fi
      in_block=false
      current_tier=""
      continue
    fi

    if $in_block; then
      case "$line" in
        tier:*) current_tier="${line#tier:}" ;;
        title:*) current_block="### ${line#title:}" ;;
        source:*) current_block="$current_block"$'\n'"- **Source:** ${line#source:}" ;;
        score:*) current_block="$current_block"$'\n'"- **Score:** ${line#score:}/100" ;;
        url:*) current_block="$current_block"$'\n'"- **URL:** ${line#url:}" ;;
        takeaway:*) current_block="$current_block"$'\n'"- **Key Takeaway:** ${line#takeaway:}" ;;
      esac
    fi
  done < "$OUTPUT_DIR/.temp_results"
}

# Regenerate markdown with proper tier grouping
cat > "$MD_FILE" << EOF
# ${TOPIC} Research
Generated: $(date "+%Y-%m-%d %H:%M")
EOF

for tier in S A B C D "?"; do
  generate_markdown_by_tier "$tier" >> "$MD_FILE"
done

# Generate JSON
echo "{" > "$JSON_FILE"
echo "  \"topic\": $(echo "$TOPIC" | jq -R .)," >> "$JSON_FILE"
echo "  \"generated\": \"$TIMESTAMP\"," >> "$JSON_FILE"
echo "  \"config\": {" >> "$JSON_FILE"
echo "    \"count\": $COUNT," >> "$JSON_FILE"
echo "    \"searchEngine\": \"$SEARCH_ENGINE\"," >> "$JSON_FILE"
echo "    \"youtube\": $YOUTUBE," >> "$JSON_FILE"
echo "    \"articles\": $ARTICLES" >> "$JSON_FILE"
echo "  }," >> "$JSON_FILE"
echo "  \"summary\": {" >> "$JSON_FILE"
echo "    \"total\": $TOTAL_ITEMS," >> "$JSON_FILE"
echo "    \"tiers\": {" >> "$JSON_FILE"
echo "      \"S\": ${TIER_COUNTS[S]}," >> "$JSON_FILE"
echo "      \"A\": ${TIER_COUNTS[A]}," >> "$JSON_FILE"
echo "      \"B\": ${TIER_COUNTS[B]}," >> "$JSON_FILE"
echo "      \"C\": ${TIER_COUNTS[C]}," >> "$JSON_FILE"
echo "      \"D\": ${TIER_COUNTS[D]}" >> "$JSON_FILE"
echo "    }" >> "$JSON_FILE"
echo "  }," >> "$JSON_FILE"
echo "  \"results\": [" >> "$JSON_FILE"

# Add results array
first=true
for result in "${JSON_RESULTS[@]}"; do
  if $first; then
    first=false
  else
    echo "," >> "$JSON_FILE"
  fi
  echo "    $result" >> "$JSON_FILE"
done

echo "  ]" >> "$JSON_FILE"
echo "}" >> "$JSON_FILE"

# Clean up temp file
rm -f "$OUTPUT_DIR/.temp_results"

# Summary
echo ""
echo -e "${BOLD}════════════════════════════════════════${NC}"
echo -e "${BOLD}RESULTS SUMMARY${NC}"
echo -e "${BOLD}════════════════════════════════════════${NC}"
echo -e "🏆 S-tier: ${GREEN}${TIER_COUNTS[S]}${NC} items"
echo -e "⭐ A-tier: ${GREEN}${TIER_COUNTS[A]}${NC} items"
echo -e "👍 B-tier: ${YELLOW}${TIER_COUNTS[B]}${NC} items"
echo -e "📄 C-tier: ${TIER_COUNTS[C]} items"
echo -e "⚠️  D-tier: ${TIER_COUNTS[D]} items"
echo ""
echo -e "${BOLD}Files written:${NC}"
echo -e "  → ${CYAN}$MD_FILE${NC}"
echo -e "  → ${CYAN}$JSON_FILE${NC}"
