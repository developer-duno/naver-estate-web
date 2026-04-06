"""학군 정보 HTML 포맷"""

from utils import _format_date_yyyymmdd


def format_school_data(data):
    """학군 API 응답을 HTML로 포맷"""
    html = ""
    school_list = data.get("schools", data.get("schoolList", []))
    if isinstance(data, list):
        school_list = data

    if not school_list:
        return "<p>학군 정보가 없습니다.</p>"

    # 배정 안내 메시지
    alloc_msg = data.get("allocationMessage", "")
    if alloc_msg:
        html += f"<p style='color:#1565c0; margin-bottom:10px;'>{alloc_msg}</p>"

    html += "<table border='1' cellpadding='5' cellspacing='0' style='border-collapse:collapse; width:100%; font-size:12px;'>"
    html += "<tr style='background-color:#e8f5e9;'>"
    html += "<th>학교명</th><th>구분</th><th>설립</th><th>도보</th>"
    html += "<th>학생수</th><th>학급수</th><th>학급당 학생</th><th>교사당 학생</th>"
    html += "</tr>"

    for school in school_list:
        if isinstance(school, dict):
            name = school.get("schoolName", "-")
            stype = "-"
            if "초등학교" in name or "초등" in name:
                stype = "초등"
            elif "중학교" in name or "중학" in name:
                stype = "중학"
            elif "고등학교" in name or "고등" in name:
                stype = "고등"
            org_type = school.get("organizationType", "-")
            walk_time = school.get("walkTime", "-")
            if isinstance(walk_time, (int, float)):
                walk_time = f"{walk_time}분"

            total_students = school.get("totalStudentCount", "-")
            total_classes = school.get("totalClassroomCount", "-")
            per_class = school.get("studentCountPerClassroom", "-")
            per_teacher = school.get("studentCountPerTeacher", "-")

            if isinstance(per_class, float):
                per_class = f"{per_class:.1f}"
            if isinstance(per_teacher, float):
                per_teacher = f"{per_teacher:.1f}"

            html += f"<tr><td>{name}</td><td>{stype}</td><td>{org_type}</td><td>{walk_time}</td>"
            html += f"<td>{total_students}</td><td>{total_classes}</td><td>{per_class}</td><td>{per_teacher}</td></tr>"

    html += "</table>"

    # 학교별 상세 정보
    html += "<p style='font-weight:bold; font-size:13px; margin:10px 0 4px;'>학교별 상세 정보</p>"
    for school in school_list:
        if not isinstance(school, dict):
            continue
        name = school.get("schoolName", "-")

        html += '<div style="border:1px solid #c8e6c9; border-radius:5px; padding:10px; margin-bottom:8px; background:#f9fbe7;">'
        html += f'<b style="font-size:13px;">{name}</b>'
        html += '<table cellpadding="6" style="margin-top:5px; width:100%;">'

        address = school.get("address", "")
        phone = school.get("phoneNumber", "")
        establish_ymd = school.get("establishYmd", "")
        education_office = school.get("educationOfficeName", "")
        district = school.get("districtName", "")
        homepage = school.get("homepageUrl", "")
        teacher_count = school.get("teacherCount", "")
        walk_dist = school.get("walkDistance", "")
        walk_time_d = school.get("walkTime", "")

        detail_rows = []
        if address:
            detail_rows.append(("주소", address))
        if phone:
            detail_rows.append(("전화", phone))
        if establish_ymd:
            detail_rows.append(("설립일", _format_date_yyyymmdd(str(establish_ymd))))
        if education_office:
            detail_rows.append(("교육청", education_office))
        if district:
            detail_rows.append(("학군", district))
        if teacher_count:
            detail_rows.append(("교직원수", f"{teacher_count}명"))
        if walk_dist or walk_time_d:
            dist_str = f"{walk_dist}m" if walk_dist else ""
            time_str = f" (도보 {walk_time_d}분)" if isinstance(walk_time_d, (int, float)) else ""
            detail_rows.append(("거리", f"{dist_str}{time_str}"))

        for i in range(0, len(detail_rows), 2):
            html += '<tr>'
            lbl1, val1 = detail_rows[i]
            html += f'<td style="color:#888; width:70px;">{lbl1}</td><td>{val1}</td>'
            if i + 1 < len(detail_rows):
                lbl2, val2 = detail_rows[i + 1]
                html += f'<td style="color:#888; width:70px;">{lbl2}</td><td>{val2}</td>'
            html += '</tr>'

        # 학년별 학생수
        grade_counts = school.get("gradeCounts") or school.get("gradeStudentCountList") or []
        if grade_counts and isinstance(grade_counts, list):
            html += '<tr><td style="color:#888;" colspan="4"><b>학년별 학생수:</b> '
            parts = []
            for gc in grade_counts:
                if isinstance(gc, dict):
                    grade = gc.get("grade") or gc.get("gradeNo", "")
                    count = gc.get("studentCount") or gc.get("count", "")
                    if grade and count:
                        parts.append(f"{grade}학년: {count}명")
            if parts:
                html += ", ".join(parts)
            else:
                html += "-"
            html += '</td></tr>'

        html += '</table>'

        if homepage:
            html += f'<a href="{homepage}" style="color:#1976D2; font-size:12px;">홈페이지</a>'

        html += '</div>'

    return html
