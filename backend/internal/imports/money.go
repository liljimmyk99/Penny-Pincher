package imports

import (
	"math"
	"regexp"
	"strconv"
	"strings"
)

// Issue codes, matching the spec's ImportIssueCode.
const (
	CodeUnknownCategory     = "unknown_category"
	CodeUnknownIncomeSource = "unknown_income_source"
	CodeInvalidDate         = "invalid_date"
	CodeMissingValue        = "missing_value"
	CodeInvalidNumber       = "invalid_number"
	CodeTooManyDecimals     = "too_many_decimals"
	CodeZeroAmount          = "zero_amount"
	CodeNegativeIncome      = "negative_income"
	CodeTaxableExceedsGross = "taxable_exceeds_gross"
	CodeNetExceedsGross     = "net_exceeds_gross"
	CodeTextTooLong         = "text_too_long"
)

// number is a plain decimal, optionally signed, with an optional exponent (how
// Excel stores very large or small numbers).
var number = regexp.MustCompile(`^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$`)

// maxIntDigits keeps dollars*100 far inside int64.
const maxIntDigits = 12

// ParseCents converts a dollar amount as written in the file to integer cents,
// exactly, without floats in the conversion itself. It returns an issue code
// when the text is not a number (CodeInvalidNumber) or has more than two
// decimals (CodeTooManyDecimals). The caller handles blank and zero.
//
// One exception to "no floats": Excel stores numeric cells as binary doubles,
// so a typed 19.99 can be saved as 19.989999999999998. Values written with an
// exponent, or with more than nine decimals, are first rounded to the 15
// significant digits Excel itself shows, which restores what the user typed.
func ParseCents(s string) (int64, string) {
	s = strings.TrimSpace(s)
	if !number.MatchString(s) {
		return 0, CodeInvalidNumber
	}
	if strings.ContainsAny(s, "eE") || decimals(s) > 9 {
		f, err := strconv.ParseFloat(s, 64)
		if err != nil || math.IsInf(f, 0) || math.IsNaN(f) {
			return 0, CodeInvalidNumber
		}
		r, err := strconv.ParseFloat(strconv.FormatFloat(f, 'g', 15, 64), 64)
		if err != nil {
			return 0, CodeInvalidNumber
		}
		s = strconv.FormatFloat(r, 'f', -1, 64)
	}

	neg := false
	switch s[0] {
	case '-':
		neg, s = true, s[1:]
	case '+':
		s = s[1:]
	}
	whole, frac, _ := strings.Cut(s, ".")
	frac = strings.TrimRight(frac, "0")
	if len(frac) > 2 {
		return 0, CodeTooManyDecimals
	}
	whole = strings.TrimLeft(whole, "0")
	if len(whole) > maxIntDigits {
		return 0, CodeInvalidNumber
	}
	frac += strings.Repeat("0", 2-len(frac))
	n, err := strconv.ParseInt(whole+frac, 10, 64)
	if err != nil {
		return 0, CodeInvalidNumber
	}
	if neg {
		n = -n
	}
	return n, ""
}

func decimals(s string) int {
	_, frac, ok := strings.Cut(s, ".")
	if !ok {
		return 0
	}
	return len(frac)
}
