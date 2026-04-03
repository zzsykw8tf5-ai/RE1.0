"""
Full Discounted Cash Flow (DCF) model for real estate investment analysis.

Supports 10-year hold period with:
- Annual cash flow projections
- Debt service calculation (amortizing mortgage)
- Terminal value / exit cap rate
- NPV, IRR, Equity Multiple, Cash-on-Cash
- Sensitivity analysis
- DSCR tracking
"""

import math
from typing import Any

try:
    import numpy_financial as npf
    NPF_AVAILABLE = True
except ImportError:
    NPF_AVAILABLE = False


def _pmt(rate: float, nper: int, pv: float) -> float:
    """Calculate fixed mortgage payment."""
    if rate == 0:
        return pv / nper
    return pv * (rate * (1 + rate) ** nper) / ((1 + rate) ** nper - 1)


def _irr_newton(cashflows: list[float], guess: float = 0.10, max_iter: int = 1000) -> float | None:
    """Newton-Raphson IRR calculation fallback."""
    rate = guess
    for _ in range(max_iter):
        npv = sum(cf / (1 + rate) ** t for t, cf in enumerate(cashflows))
        dnpv = sum(-t * cf / (1 + rate) ** (t + 1) for t, cf in enumerate(cashflows) if t > 0)
        if abs(dnpv) < 1e-12:
            break
        new_rate = rate - npv / dnpv
        if abs(new_rate - rate) < 1e-8:
            return new_rate
        rate = new_rate
    return rate if -1 < rate < 100 else None


def _calculate_irr(cashflows: list[float]) -> float | None:
    """Calculate IRR using numpy_financial if available, else Newton-Raphson."""
    if NPF_AVAILABLE:
        try:
            result = npf.irr(cashflows)
            if result is not None and not math.isnan(result):
                return float(result)
        except Exception:
            pass
    return _irr_newton(cashflows)


def _calculate_npv(rate: float, cashflows: list[float]) -> float:
    """Calculate NPV using numpy_financial if available."""
    if NPF_AVAILABLE:
        try:
            return float(npf.npv(rate, cashflows))
        except Exception:
            pass
    return sum(cf / (1 + rate) ** t for t, cf in enumerate(cashflows))


def _build_amortization(
    loan_amount: float,
    annual_interest_rate: float,
    loan_term_years: int,
    hold_period: int,
) -> list[dict]:
    """Build annual amortization schedule."""
    if loan_amount <= 0 or annual_interest_rate <= 0:
        return [{"year": y + 1, "debt_service": 0, "interest": 0, "principal": 0, "balance": 0}
                for y in range(hold_period)]

    monthly_rate = annual_interest_rate / 12
    n_payments = loan_term_years * 12
    monthly_payment = _pmt(monthly_rate, n_payments, loan_amount)
    annual_payment = monthly_payment * 12

    schedule = []
    balance = loan_amount

    for year in range(1, hold_period + 1):
        year_interest = 0
        year_principal = 0

        for month in range(12):
            month_interest = balance * monthly_rate
            month_principal = monthly_payment - month_interest
            if month_principal > balance:
                month_principal = balance
            balance -= month_principal
            balance = max(0, balance)
            year_interest += month_interest
            year_principal += month_principal

        schedule.append({
            "year": year,
            "debt_service": round(annual_payment, 2),
            "interest": round(year_interest, 2),
            "principal": round(year_principal, 2),
            "balance": round(balance, 2),
        })

    return schedule


def run_dcf(params: dict) -> dict:
    """
    Full 10-year DCF model for real estate investment.

    Required params:
        purchase_price (float):        Acquisition price ($)
        initial_noi (float):           Year 1 NOI ($ net operating income)

    Optional params:
        rent_growth_rate (float):      Annual rent growth (default 0.02 = 2%)
        expense_growth_rate (float):   Annual expense growth (default 0.025)
        vacancy_rate (float):          Stabilized vacancy (default 0.05)
        capex_rate (float):            CapEx as % of EGI (default 0.02)
        discount_rate (float):         Required return / WACC (default 0.08)
        hold_period (int):             Hold period years (default 10)
        exit_cap_rate (float):         Terminal cap rate (default initial NOI yield + 50bps)
        loan_amount (float):           Mortgage amount ($, default 0)
        interest_rate (float):         Annual interest rate (default 0.065)
        loan_term (int):               Amortization years (default 25)
        equity_invested (float):       Equity investment (default purchase_price - loan_amount)
        gross_income_yr1 (float):      Gross income year 1 (if NOI not provided directly)
        expense_ratio (float):         Operating expense ratio (if deriving NOI)
        closing_costs_pct (float):     Acquisition costs (default 0.015)
        disposition_costs_pct (float): Sale costs (default 0.01)
    """
    # Core inputs
    purchase_price = float(params.get("purchase_price", 0))
    initial_noi = float(params.get("initial_noi", 0))
    hold_period = int(params.get("hold_period", 10))

    # Growth rates
    rent_growth_rate = float(params.get("rent_growth_rate", 0.02))
    expense_growth_rate = float(params.get("expense_growth_rate", 0.025))
    vacancy_rate = float(params.get("vacancy_rate", 0.05))
    capex_rate = float(params.get("capex_rate", 0.02))

    # Finance
    discount_rate = float(params.get("discount_rate", 0.08))
    loan_amount = float(params.get("loan_amount", 0))
    interest_rate = float(params.get("interest_rate", 0.065))
    loan_term = int(params.get("loan_term", 25))

    # If NOI not provided, derive from gross income
    if initial_noi == 0:
        gross_income_yr1 = float(params.get("gross_income_yr1", 0))
        expense_ratio = float(params.get("expense_ratio", 0.35))
        if gross_income_yr1 > 0:
            egi_yr1 = gross_income_yr1 * (1 - vacancy_rate)
            initial_noi = egi_yr1 * (1 - expense_ratio)

    # Costs
    closing_costs_pct = float(params.get("closing_costs_pct", 0.015))
    disposition_costs_pct = float(params.get("disposition_costs_pct", 0.010))

    # Equity
    equity_invested_default = purchase_price - loan_amount + purchase_price * closing_costs_pct
    equity_invested = float(params.get("equity_invested", equity_invested_default))

    # Exit cap rate: if not provided, use initial yield + 50bps
    initial_yield = initial_noi / purchase_price if purchase_price > 0 else 0.065
    default_exit_cap = initial_yield + 0.005
    exit_cap_rate = float(params.get("exit_cap_rate", default_exit_cap))

    # Build amortization schedule
    amort_schedule = _build_amortization(loan_amount, interest_rate, loan_term, hold_period)

    # ─── Build annual cash flows ───────────────────────────────────────────────
    # Reconstruct income/expense breakdown if we only have NOI
    # Assume initial gross income & expenses based on typical ratio
    initial_gross_income = initial_noi / 0.65 if initial_noi > 0 else 0  # Rough: 35% expenses
    initial_expenses = initial_gross_income * 0.35
    initial_capex = initial_gross_income * (1 - vacancy_rate) * capex_rate

    yearly_cashflows = []
    cumulative_cf = 0

    for year in range(1, hold_period + 1):
        # Income grows at rent_growth_rate
        growth_income = (1 + rent_growth_rate) ** (year - 1)
        growth_expense = (1 + expense_growth_rate) ** (year - 1)

        gross_income = initial_gross_income * growth_income
        vacancy_loss = gross_income * vacancy_rate
        effective_income = gross_income - vacancy_loss

        # Expenses grow at expense_growth_rate
        operating_expenses = initial_expenses * growth_expense

        # NOI
        noi = effective_income - operating_expenses

        # CapEx (% of EGI, grows with expenses)
        capex = effective_income * capex_rate

        # Debt service from amortization schedule
        amort = amort_schedule[year - 1]
        debt_service = amort["debt_service"]

        # Cash flow before tax
        cfbt = noi - debt_service - capex

        cumulative_cf += cfbt

        # DSCR
        dscr = noi / debt_service if debt_service > 0 else None

        yearly_cashflows.append({
            "year": year,
            "gross_income": round(gross_income, 2),
            "vacancy_loss": round(vacancy_loss, 2),
            "effective_income": round(effective_income, 2),
            "operating_expenses": round(operating_expenses, 2),
            "noi": round(noi, 2),
            "debt_service": round(debt_service, 2),
            "capex": round(capex, 2),
            "cash_flow_before_tax": round(cfbt, 2),
            "cumulative_cf": round(cumulative_cf, 2),
            "dscr": round(dscr, 2) if dscr is not None else None,
            "debt_balance": amort["balance"],
            "interest_paid": amort["interest"],
            "principal_paid": amort["principal"],
        })

    # ─── Terminal / Exit Value ─────────────────────────────────────────────────
    # Exit NOI = hold_period+1 NOI (forward cap)
    exit_noi = initial_noi * (1 + rent_growth_rate) ** hold_period
    gross_sale_price = exit_noi / exit_cap_rate if exit_cap_rate > 0 else 0
    disposition_costs = gross_sale_price * disposition_costs_pct
    net_sale_proceeds = gross_sale_price - disposition_costs

    # Remaining mortgage balance at end of hold period
    remaining_balance = amort_schedule[-1]["balance"] if amort_schedule else 0

    # Net equity from sale
    equity_from_sale = net_sale_proceeds - remaining_balance

    # ─── Cash flow to equity ──────────────────────────────────────────────────
    # Initial equity outflow (negative)
    equity_cashflows = [-equity_invested]

    for ycf in yearly_cashflows:
        equity_cashflows.append(ycf["cash_flow_before_tax"])

    # Add net sale proceeds to final year
    equity_cashflows[-1] = equity_cashflows[-1] + equity_from_sale

    # ─── Total returns ────────────────────────────────────────────────────────
    total_cashflow_from_operations = sum(ycf["cash_flow_before_tax"] for ycf in yearly_cashflows)
    total_equity_return = total_cashflow_from_operations + equity_from_sale

    # ─── Investment metrics ───────────────────────────────────────────────────
    # NPV (equity perspective)
    npv = _calculate_npv(discount_rate, equity_cashflows)

    # IRR
    irr = _calculate_irr(equity_cashflows)

    # Equity Multiple
    total_distributions = sum(cf for cf in equity_cashflows[1:] if cf > 0)
    equity_multiple = (total_distributions + max(0, equity_from_sale)) / equity_invested if equity_invested > 0 else 0
    # More precise: sum of all positive returns / initial equity
    total_equity_returned = sum(equity_cashflows[1:])  # All returns including sale
    equity_multiple_precise = (equity_invested + total_equity_returned) / equity_invested if equity_invested > 0 else 0

    # Cash-on-cash returns
    coc_returns = []
    for ycf in yearly_cashflows:
        coc = (ycf["cash_flow_before_tax"] / equity_invested * 100) if equity_invested > 0 else 0
        coc_returns.append(round(coc, 2))

    # DSCR list
    dscr_list = [ycf["dscr"] for ycf in yearly_cashflows]

    # Payback period
    payback_period = None
    cumulative = 0
    for i, ycf in enumerate(yearly_cashflows):
        cumulative += ycf["cash_flow_before_tax"]
        if cumulative >= equity_invested:
            payback_period = i + 1
            break

    # LTV
    ltv = (loan_amount / purchase_price * 100) if purchase_price > 0 else 0

    # ─── Sensitivity Analysis ─────────────────────────────────────────────────
    sensitivity = _run_sensitivity(
        purchase_price=purchase_price,
        initial_noi=initial_noi,
        hold_period=hold_period,
        rent_growth_rate=rent_growth_rate,
        expense_growth_rate=expense_growth_rate,
        vacancy_rate=vacancy_rate,
        capex_rate=capex_rate,
        discount_rate=discount_rate,
        exit_cap_rate=exit_cap_rate,
        loan_amount=loan_amount,
        interest_rate=interest_rate,
        loan_term=loan_term,
        equity_invested=equity_invested,
        disposition_costs_pct=disposition_costs_pct,
        initial_gross_income=initial_gross_income,
        initial_expenses=initial_expenses,
    )

    return {
        "inputs": {
            "purchase_price": purchase_price,
            "initial_noi": round(initial_noi, 2),
            "hold_period_years": hold_period,
            "rent_growth_rate_pct": round(rent_growth_rate * 100, 2),
            "expense_growth_rate_pct": round(expense_growth_rate * 100, 2),
            "vacancy_rate_pct": round(vacancy_rate * 100, 1),
            "capex_rate_pct": round(capex_rate * 100, 1),
            "discount_rate_pct": round(discount_rate * 100, 2),
            "exit_cap_rate_pct": round(exit_cap_rate * 100, 2),
            "loan_amount": loan_amount,
            "ltv_pct": round(ltv, 1),
            "interest_rate_pct": round(interest_rate * 100, 2),
            "loan_term_years": loan_term,
            "equity_invested": round(equity_invested, 2),
        },
        "yearly_cashflows": yearly_cashflows,
        "terminal_value": round(gross_sale_price, 2),
        "net_sale_proceeds": round(net_sale_proceeds, 2),
        "equity_from_sale": round(equity_from_sale, 2),
        "sale_proceeds": round(net_sale_proceeds, 2),
        "total_equity_return": round(total_equity_return, 2),
        "metrics": {
            "npv": round(npv, 2),
            "irr_pct": round(irr * 100, 2) if irr is not None else None,
            "equity_multiple": round(equity_multiple_precise, 2),
            "cash_on_cash_returns": coc_returns,
            "dscr": dscr_list,
            "payback_period_years": payback_period,
            "initial_cap_rate_pct": round(initial_yield * 100, 2),
            "exit_cap_rate_pct": round(exit_cap_rate * 100, 2),
            "ltv_pct": round(ltv, 1),
            "average_coc_return_pct": round(sum(coc_returns) / len(coc_returns), 2) if coc_returns else 0,
            "min_dscr": round(min(d for d in dscr_list if d is not None), 2) if any(d for d in dscr_list if d) else None,
        },
        "sensitivity": sensitivity,
        "debt_summary": {
            "loan_amount": round(loan_amount, 2),
            "total_interest_paid": round(sum(y["interest_paid"] for y in yearly_cashflows), 2),
            "total_principal_paid": round(sum(y["principal_paid"] for y in yearly_cashflows), 2),
            "remaining_balance": round(remaining_balance, 2),
        },
    }


def _run_sensitivity(
    purchase_price, initial_noi, hold_period, rent_growth_rate,
    expense_growth_rate, vacancy_rate, capex_rate, discount_rate,
    exit_cap_rate, loan_amount, interest_rate, loan_term,
    equity_invested, disposition_costs_pct, initial_gross_income, initial_expenses,
) -> dict:
    """
    Sensitivity analysis: IRR and NPV at different exit cap rates and rent growth scenarios.
    """
    # Cap rate scenarios: base ±100bps, ±200bps
    cap_rate_scenarios = [
        exit_cap_rate - 0.020,
        exit_cap_rate - 0.010,
        exit_cap_rate,
        exit_cap_rate + 0.010,
        exit_cap_rate + 0.020,
    ]

    # Rent growth scenarios: base ±100bps, ±200bps
    rent_growth_scenarios = [
        rent_growth_rate - 0.020,
        rent_growth_rate - 0.010,
        rent_growth_rate,
        rent_growth_rate + 0.010,
        rent_growth_rate + 0.020,
    ]

    def quick_irr_npv(exit_cr, rent_gr):
        """Calculate IRR and NPV for a given exit cap rate and rent growth."""
        amort = _build_amortization(loan_amount, interest_rate, loan_term, hold_period)
        eqcf = [-equity_invested]
        for yr in range(1, hold_period + 1):
            growth_i = (1 + rent_gr) ** (yr - 1)
            growth_e = (1 + expense_growth_rate) ** (yr - 1)
            gross_i = initial_gross_income * growth_i
            eff_i = gross_i * (1 - vacancy_rate)
            ops_e = initial_expenses * growth_e
            noi_yr = eff_i - ops_e
            capex_yr = eff_i * capex_rate
            ds = amort[yr - 1]["debt_service"]
            cfbt = noi_yr - ds - capex_yr
            eqcf.append(cfbt)

        # Exit
        exit_noi_yr = initial_noi * (1 + rent_gr) ** hold_period
        sale_price = exit_noi_yr / exit_cr if exit_cr > 0 else 0
        net_sale = sale_price * (1 - disposition_costs_pct)
        remaining_bal = amort[-1]["balance"]
        equity_sale = net_sale - remaining_bal
        eqcf[-1] += equity_sale

        irr = _calculate_irr(eqcf)
        npv = _calculate_npv(discount_rate, eqcf)
        return irr, npv

    # Build sensitivity table: IRR matrix (exit_cap x rent_growth)
    irr_matrix = {}
    npv_matrix = {}

    for ecr in cap_rate_scenarios:
        ecr_label = f"{ecr*100:.1f}%"
        irr_row = {}
        npv_row = {}
        for rgr in rent_growth_scenarios:
            rgr_label = f"{rgr*100:.1f}%"
            irr_val, npv_val = quick_irr_npv(max(0.001, ecr), rgr)
            irr_row[rgr_label] = round(irr_val * 100, 2) if irr_val is not None else None
            npv_row[rgr_label] = round(npv_val, 0) if npv_val is not None else None
        irr_matrix[ecr_label] = irr_row
        npv_matrix[ecr_label] = npv_row

    # Vacancy sensitivity
    vacancy_irrs = {}
    for vac in [0.0, 0.05, 0.10, 0.15, 0.20, 0.25]:
        irr_val, _ = quick_irr_npv(exit_cap_rate, rent_growth_rate)
        # Recalculate with vacancy override
        amort = _build_amortization(loan_amount, interest_rate, loan_term, hold_period)
        eqcf = [-equity_invested]
        for yr in range(1, hold_period + 1):
            gross_i = initial_gross_income * (1 + rent_growth_rate) ** (yr - 1)
            eff_i = gross_i * (1 - vac)  # Override vacancy
            ops_e = initial_expenses * (1 + expense_growth_rate) ** (yr - 1)
            noi_yr = eff_i - ops_e
            capex_yr = eff_i * capex_rate
            ds = amort[yr - 1]["debt_service"]
            eqcf.append(noi_yr - ds - capex_yr)
        exit_noi_yr = initial_noi * (1 + rent_growth_rate) ** hold_period * (1 - vac) / (1 - vacancy_rate) if vacancy_rate < 1 else 0
        sale_price = exit_noi_yr / exit_cap_rate if exit_cap_rate > 0 else 0
        net_sale = sale_price * (1 - disposition_costs_pct)
        remaining_bal = amort[-1]["balance"]
        eqcf[-1] += net_sale - remaining_bal
        irr_v = _calculate_irr(eqcf)
        vacancy_irrs[f"{int(vac*100)}%"] = round(irr_v * 100, 2) if irr_v is not None else None

    return {
        "description": "Sensitivity of IRR and NPV to exit cap rate and rent growth",
        "irr_matrix": {
            "rows": "Exit Cap Rate",
            "columns": "Rent Growth Rate",
            "values_pct": irr_matrix,
        },
        "npv_matrix": {
            "rows": "Exit Cap Rate",
            "columns": "Rent Growth Rate",
            "values_usd": npv_matrix,
        },
        "vacancy_sensitivity": {
            "description": "IRR at different stabilized vacancy rates",
            "values": vacancy_irrs,
        },
    }
