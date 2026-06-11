import os
import re
import requests
import json
from datetime import datetime, timedelta

try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
except ImportError:
    pass

QWEATHER_API_KEY = os.environ.get("QWEATHER_API_KEY", "")
QWEATHER_API_HOST = os.environ.get("QWEATHER_API_HOST", "").strip().rstrip("/")
DEFAULT_LOCATION = os.environ.get("QWEATHER_DEFAULT_LOCATION", "101280101")

# 无专属 Host 时回退公共地址（建议尽快在控制台配置 QWEATHER_API_HOST）
FALLBACK_API_HOST = "https://devapi.qweather.com"
FALLBACK_GEO_HOST = "https://geoapi.qweather.com"


class WeatherService:
    def __init__(self, data_dir="data"):
        self.data_dir = data_dir
        self.cache_file = os.path.join(data_dir, "weather_cache.json")
        self.daily_file = os.path.join(data_dir, "daily_weather.json")
        self._ensure_dir()

    def _ensure_dir(self):
        if not os.path.exists(self.data_dir):
            os.makedirs(self.data_dir)

    def _api_host(self):
        if QWEATHER_API_HOST:
            host = QWEATHER_API_HOST
            if not host.startswith("http"):
                host = f"https://{host}"
            return host.rstrip("/")
        return FALLBACK_API_HOST

    def _geo_host(self):
        if QWEATHER_API_HOST:
            return self._api_host()
        return FALLBACK_GEO_HOST

    def _headers(self):
        headers = {
            "User-Agent": "healthy-silver-health/1.0",
            "Accept-Encoding": "gzip",
        }
        if QWEATHER_API_KEY:
            headers["X-QW-Api-Key"] = QWEATHER_API_KEY
        return headers

    def _get_cache(self):
        if os.path.exists(self.cache_file):
            try:
                with open(self.cache_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                return {}
        return {}

    def _save_cache(self, location_key, data):
        cache = self._get_cache()
        cache[location_key] = {
            "timestamp": datetime.now().timestamp(),
            "data": data,
        }
        with open(self.cache_file, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, indent=2)

    def _get_cached(self, location_key, max_age=600):
        entry = self._get_cache().get(location_key)
        if not entry:
            return None
        if datetime.now().timestamp() - entry.get("timestamp", 0) > max_age:
            return None
        return entry.get("data")

    def _save_daily(self, data):
        daily_data = self._get_daily_data()
        today = datetime.now().strftime("%Y-%m-%d")
        daily_data[today] = data
        with open(self.daily_file, "w", encoding="utf-8") as f:
            json.dump(daily_data, f, ensure_ascii=False, indent=2)

    def _get_daily_data(self):
        if os.path.exists(self.daily_file):
            try:
                with open(self.daily_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                return {}
        return {}

    def _qweather_get(self, base_host, path, params):
        if not QWEATHER_API_KEY:
            raise RuntimeError("QWEATHER_API_KEY 未配置")

        url = f"{base_host}{path}"
        resp = requests.get(url, params=params, headers=self._headers(), timeout=12)
        resp.raise_for_status()
        result = resp.json()
        if str(result.get("code")) != "200":
            raise RuntimeError(f"和风天气返回错误 code={result.get('code')}")
        return result

    def _is_location_id(self, location):
        return bool(re.fullmatch(r"\d{6,12}", str(location or "").strip()))

    def _is_lat_lon(self, location):
        return bool(re.fullmatch(r"-?\d+(?:\.\d{1,2})?,-?\d+(?:\.\d{1,2})?", str(location or "").strip()))

    def _extract_location_id_from_fxlink(self, fx_link):
        if not fx_link:
            return None
        match = re.search(r"-(\d{9})\.html", fx_link)
        return match.group(1) if match else None

    def _reverse_geocode_name(self, lon, lat):
        """GeoAPI 不可用时的备用：OpenStreetMap 逆地理编码"""
        try:
            resp = requests.get(
                "https://nominatim.openstreetmap.org/reverse",
                params={
                    "lat": lat,
                    "lon": lon,
                    "format": "json",
                    "accept-language": "zh-CN",
                    "zoom": 10,
                },
                headers={"User-Agent": "healthy-silver-health/1.0 (course project)"},
                timeout=8,
            )
            resp.raise_for_status()
            address = resp.json().get("address") or {}
            district = (
                address.get("district")
                or address.get("city_district")
                or address.get("suburb")
                or address.get("county")
            )
            city = address.get("city") or address.get("town") or address.get("state")
            if district and city and district != city:
                return f"{district}（{city}）"
            return district or city or address.get("state")
        except Exception as e:
            print(f"[天气] 逆地理编码失败: {e}")
            return None

    def _resolve_city_name(self, resolved, raw_location):
        city = resolved.get("city") or ""
        if city not in ("当前位置", "当前城市", ""):
            return city

        loc_id = resolved.get("locationId")
        if loc_id and self._is_location_id(str(loc_id)):
            known = self._city_name_from_id(str(loc_id))
            if known != "当前城市":
                return known

        if self._is_lat_lon(raw_location or ""):
            lon, lat = [p.strip() for p in raw_location.split(",", 1)]
            name = self._reverse_geocode_name(lon, lat)
            if name:
                return name

        return city or "当前位置"

    def _format_geo_display(self, item):
        name = item.get("name", "")
        adm1 = item.get("adm1", "")
        adm2 = item.get("adm2", "")
        display = f"{adm2 or name}" if adm2 and adm2 != adm1 else name
        if adm1 and adm1 not in display:
            display = f"{display}（{adm1}）" if display != adm1 else adm1
        return display

    def _lookup_geo(self, loc):
        result = self._qweather_get(
            self._geo_host(),
            "/geo/v2/city/lookup",
            {"location": loc, "number": 1, "lang": "zh"},
        )
        items = result.get("location") or []
        if not items:
            raise RuntimeError(f"未找到地区: {loc}")
        item = items[0]
        return {
            "locationId": item.get("id", loc),
            "city": self._format_geo_display(item),
            "adm": item.get("adm1", ""),
            "lat": item.get("lat", ""),
            "lon": item.get("lon", ""),
        }

    def resolve_location(self, location=None):
        """
        将城市名 / LocationID / 经纬度 统一解析为和风 location 参数。
        返回: { locationId, city, adm, lat, lon }
        """
        loc = (location or DEFAULT_LOCATION).strip()

        if self._is_location_id(loc):
            return {
                "locationId": loc,
                "city": self._city_name_from_id(loc),
                "adm": "",
                "lat": "",
                "lon": "",
            }

        if self._is_lat_lon(loc):
            if QWEATHER_API_KEY:
                try:
                    return self._lookup_geo(loc)
                except Exception as e:
                    print(f"[天气] 经纬度反查城市失败: {e}")
            return {
                "locationId": loc,
                "city": "当前位置",
                "adm": "",
                "lat": loc.split(",")[1] if "," in loc else "",
                "lon": loc.split(",")[0] if "," in loc else "",
            }

        if not QWEATHER_API_KEY:
            return {
                "locationId": DEFAULT_LOCATION,
                "city": self._city_name_from_id(DEFAULT_LOCATION),
                "adm": "",
                "lat": "",
                "lon": "",
            }

        return self._lookup_geo(loc)

    def _city_name_from_id(self, location_id):
        known = {
            "101280101": "广州",
            "101280102": "番禺",
            "101280103": "从化",
            "101280104": "增城",
            "101280105": "花都",
            "101280106": "天河",
            "101280107": "越秀",
            "101280108": "荔湾",
            "101280109": "海珠",
            "101280110": "白云",
            "101280111": "黄埔",
            "101280112": "南沙",
            "101010100": "北京",
            "101020100": "上海",
            "101210101": "杭州",
            "101230101": "福州",
            "101290101": "昆明",
            "101110101": "西安",
            "101190101": "南京",
            "101300101": "南宁",
            "101030101": "天津",
        }
        return known.get(location_id, "当前城市")

    def fetch_weather(self, location=None):
        """获取实时天气（和风天气 QWeather）"""
        raw_location = (location or DEFAULT_LOCATION).strip()
        resolved = self.resolve_location(raw_location)
        location_key = resolved["locationId"]

        cached = self._get_cached(location_key)
        if cached and cached.get("city") not in ("当前位置", "当前城市", ""):
            return cached

        if not QWEATHER_API_KEY:
            print("和风天气 Key 未配置，使用模拟数据")
            return self._generate_simulated_weather(location_key, resolved.get("city"))

        try:
            query_location = raw_location if self._is_lat_lon(raw_location) else location_key
            result = self._qweather_get(
                self._api_host(),
                "/v7/weather/now",
                {"location": query_location, "lang": "zh"},
            )
            now = result.get("now") or {}

            fx_location_id = self._extract_location_id_from_fxlink(result.get("fxLink", ""))
            if fx_location_id:
                location_key = fx_location_id
                resolved["locationId"] = fx_location_id

            city_name = self._resolve_city_name(resolved, raw_location)

            weather_data = {
                "temp": str(now.get("temp", "")),
                "feelsLike": str(now.get("feelsLike", now.get("temp", ""))),
                "weather": now.get("text", "未知"),
                "windDir": now.get("windDir", ""),
                "windScale": str(now.get("windScale", "")),
                "humidity": str(now.get("humidity", "")),
                "visibility": str(now.get("vis", "")),
                "uvIndex": self._estimate_uv(now.get("text", "")),
                "precip": str(now.get("precip", "0")),
                "pressure": str(now.get("pressure", "")),
                "updateTime": now.get("obsTime") or result.get("updateTime") or datetime.now().isoformat(),
                "city": city_name,
                "locationId": location_key,
                "source": "qweather",
            }

            self._save_cache(location_key, weather_data)
            self._save_daily(weather_data)
            return weather_data
        except requests.HTTPError as e:
            detail = ""
            try:
                detail = e.response.text[:200]
            except Exception:
                pass
            if e.response is not None and e.response.status_code == 403:
                print(
                    "和风天气 403：请检查 .env 中 QWEATHER_API_HOST 是否为控制台「设置」里的完整 API Host，"
                    "QWEATHER_API_KEY 是否为对应项目的 API Key。"
                    f" 详情: {detail or '无响应体'}"
                )
            else:
                print(f"和风天气 API 调用失败，使用模拟数据: {e}")
            return self._generate_simulated_weather(location_key, resolved.get("city"))
        except Exception as e:
            print(f"和风天气 API 调用失败，使用模拟数据: {e}")
            return self._generate_simulated_weather(location_key, resolved.get("city"))

    def fetch_forecast(self, location=None):
        """获取未来 3 天预报"""
        resolved = self.resolve_location(location)
        location_key = resolved["locationId"]

        if not QWEATHER_API_KEY:
            return self._generate_simulated_forecast()

        try:
            result = self._qweather_get(
                self._api_host(),
                "/v7/weather/3d",
                {"location": location_key, "lang": "zh"},
            )
            forecasts = []
            for day in (result.get("daily") or [])[:3]:
                forecasts.append({
                    "date": day.get("fxDate", ""),
                    "dayWeather": day.get("textDay", ""),
                    "nightWeather": day.get("textNight", ""),
                    "highTemp": str(day.get("tempMax", "")),
                    "lowTemp": str(day.get("tempMin", "")),
                    "windDir": day.get("windDirDay", ""),
                    "windScale": str(day.get("windScaleDay", "")),
                    "precip": str(day.get("precip", "0")),
                    "uvIndex": str(day.get("uvIndex", "3")),
                })
            return forecasts
        except Exception as e:
            print(f"和风天气预报 API 调用失败: {e}")
            return self._generate_simulated_forecast()

    def _estimate_uv(self, weather_text):
        if "晴" in weather_text:
            return "6"
        if "多云" in weather_text:
            return "4"
        if "阴" in weather_text or "雨" in weather_text:
            return "2"
        return "3"

    def _generate_simulated_weather(self, location_id, city_name=None):
        import random

        weather_types = ["晴", "多云", "阴", "小雨"]
        city_info = {
            "101280101": {"name": "广州", "base_temp": 28, "humidity": 75},
            "101010100": {"name": "北京", "base_temp": 22, "humidity": 45},
            "101020100": {"name": "上海", "base_temp": 25, "humidity": 65},
            "101210101": {"name": "杭州", "base_temp": 24, "humidity": 70},
        }
        info = city_info.get(location_id, {"name": city_name or "当前城市", "base_temp": 25, "humidity": 60})

        now = datetime.now()
        hour = now.hour
        temp_offset = 3 if 6 <= hour < 12 else 5 if 12 <= hour < 18 else 2 if 18 <= hour < 22 else -3

        weather_data = {
            "temp": str(info["base_temp"] + temp_offset + random.randint(-2, 2)),
            "feelsLike": str(info["base_temp"] + temp_offset + random.randint(-3, 1)),
            "weather": random.choice(weather_types),
            "windDir": random.choice(["北风", "南风", "东风", "西风"]),
            "windScale": str(random.randint(1, 4)),
            "humidity": str(info["humidity"] + random.randint(-10, 10)),
            "visibility": str(random.randint(5, 15)),
            "uvIndex": str(random.randint(2, 8)),
            "precip": "0",
            "pressure": str(random.randint(1000, 1020)),
            "updateTime": now.isoformat(),
            "city": info["name"],
            "locationId": location_id,
            "source": "simulated",
        }
        self._save_cache(location_id, weather_data)
        self._save_daily(weather_data)
        return weather_data

    def _generate_simulated_forecast(self):
        import random

        weather_types = ["晴", "多云", "阴", "小雨"]
        forecasts = []
        today = datetime.now()
        for i in range(3):
            date = (today + timedelta(days=i)).strftime("%Y-%m-%d")
            forecasts.append({
                "date": date,
                "dayWeather": random.choice(weather_types),
                "nightWeather": random.choice(weather_types),
                "highTemp": str(random.randint(25, 35)),
                "lowTemp": str(random.randint(18, 26)),
                "windDir": random.choice(["北风", "南风", "东风", "西风"]),
                "windScale": str(random.randint(1, 4)),
                "precip": "0",
                "uvIndex": str(random.randint(2, 8)),
            })
        return forecasts

    def _get_user_profile(self, user_id="default"):
        profile_file = os.path.join(self.data_dir, f"{user_id}_profile.json")
        default_file = os.path.join(self.data_dir, "default_profile.json")

        try:
            if os.path.exists(profile_file):
                with open(profile_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            if os.path.exists(default_file):
                with open(default_file, "r", encoding="utf-8") as f:
                    return json.load(f)
        except Exception as e:
            print(f"[天气服务] 获取用户档案失败: {e}")

        return {}

    def _assess_comfort_level(self, temp, humidity, feels_like):
        """
        评判体感舒适度（供健康/活动建议共用）
        - comfortable: 舒适
        - humid: 偏潮闷（湿度高但还不算典型闷热）
        - muggy: 闷热
        - hot_muggy: 高温闷热
        主要依据：体感温度 + 湿度，而非单看气温。
        """
        effective = int(feels_like if feels_like is not None else temp)

        if effective >= 32 or (temp >= 30 and humidity >= 70):
            return "hot_muggy"
        if effective >= 29 or (temp >= 28 and humidity >= 70) or (temp >= 26 and humidity >= 80):
            return "muggy"
        if humidity >= 70 or (temp >= 24 and humidity >= 65):
            return "humid"
        return "comfortable"

    def _comfort_label(self, level):
        return {
            "comfortable": "天气较舒适",
            "humid": "湿度较高、体感略闷",
            "muggy": "闷热",
            "hot_muggy": "高温闷热",
        }.get(level, "当前天气")

    def _generate_health_advisories(self, profile, temp, humidity, weather_text, wind_scale, uv_index, feels_like):
        """今日健康建议：侧重身体防护、慢病管理与安全风险，不涉及具体运动安排"""
        comfort = self._assess_comfort_level(temp, humidity, feels_like)
        advisories = []

        if temp >= 35:
            advisories.append(f"🔥 高温预警：当前{temp}°C，中暑风险高，请待在阴凉通风处，及时补水")
        elif temp >= 32:
            advisories.append(f"🌞 天气炎热：当前{temp}°C，外出需防晒，感到心慌、头晕请立即休息")
        elif temp <= 10:
            advisories.append(f"❄️ 天气寒冷：当前{temp}°C，注意头颈和足部保暖，预防心脑血管不适")
        elif temp <= 15:
            advisories.append(f"🥶 气温较低：当前{temp}°C，外出请添衣，避免清晨和夜间着凉")

        if humidity >= 85:
            advisories.append(f"💧 湿度{humidity}%偏高，体感闷重，建议少量多次喝水，室内注意通风除湿")
        elif comfort == "humid":
            advisories.append(f"💧 湿度{humidity}%、体感约{feels_like or temp}°C，{self._comfort_label(comfort)}，注意通风和补水")
        elif humidity <= 30:
            advisories.append(f"🌬️ 空气干燥（湿度{humidity}%），注意补充水分，可适当润肤护嗓")

        if "雨" in weather_text:
            advisories.append(f"🌧️ {weather_text}：路面湿滑，外出请穿防滑鞋，放慢脚步，预防跌倒")
        elif "雪" in weather_text:
            advisories.append(f"❄️ {weather_text}：路面湿滑，尽量减少不必要外出，注意保暖")

        if weather_text == "晴" and uv_index >= 7:
            advisories.append(f"☀️ 紫外线较强（UV{uv_index}），长时间外出请遮阳，保护皮肤和眼睛")
        elif "晴" in weather_text and temp >= 28:
            advisories.append("☀️ 日照较强，长时间在户外请注意防晒和补水")

        if wind_scale >= 5:
            advisories.append(f"💨 风力{wind_scale}级，体弱老人外出需有人陪同，注意防风保暖")

        if comfort in ("muggy", "hot_muggy"):
            advisories.append(f"🥵 {self._comfort_label(comfort)}，易出汗，记得及时擦汗、更换干爽衣物，避免着凉")

        advisories.extend(self._get_personalized_advisories(profile, temp, humidity, weather_text, comfort, feels_like))

        if not advisories:
            advisories.append("💚 今日天气整体平稳，请按时吃药、适量饮水，有不舒服及时告诉家人")

        return advisories

    def _get_personalized_advisories(self, profile, temp, humidity, weather_text, comfort, feels_like):
        advisories = []
        chronic_diseases = profile.get("chronicDiseases", []) or []
        weather_desc = self._comfort_label(comfort)

        has_hypertension = any("高血压" in disease or "血压" in disease for disease in chronic_diseases)
        if has_hypertension:
            if temp > 30 or comfort == "hot_muggy":
                advisories.append("❤️ 您有高血压：高温易致血压波动，建议午后测一次血压")
            elif comfort in ("humid", "muggy", "hot_muggy"):
                advisories.append(f"❤️ 您有高血压：{weather_desc}时也需注意血压变化，感到头晕请坐下休息")

        has_joint_issue = any("关节" in disease or "风湿" in disease for disease in chronic_diseases)
        if has_joint_issue:
            if humidity > 80:
                advisories.append("🦴 您有关节不适：湿度高时关节可能更酸胀，注意保暖和适度活动")
            elif "雨" in weather_text:
                advisories.append("🦴 您有关节不适：雨天注意关节保暖，避免淋雨和受凉")

        has_diabetes = any("糖尿病" in disease or "血糖" in disease for disease in chronic_diseases)
        if has_diabetes:
            if temp > 30 or comfort == "hot_muggy":
                advisories.append("🩺 您有糖尿病：高温天气请定时补水，留意血糖变化")
            elif comfort in ("humid", "muggy"):
                advisories.append(f"🩺 您有糖尿病：{weather_desc}，建议适当补水，避免一次大量饮水")

        return advisories

    def get_health_advisory(self, user_id="default", location=None):
        weather = self.fetch_weather(location)
        if not weather:
            return None

        temp = int(float(weather.get("temp") or 25))
        feels_like = int(float(weather.get("feelsLike") or temp))
        humidity = int(float(weather.get("humidity") or 60))
        wind_scale = int(float(str(weather.get("windScale", "2")).split("-")[0] or 2))
        weather_text = weather.get("weather", "")
        uv_index = int(float(weather.get("uvIndex") or 5))
        current_hour = datetime.now().hour
        comfort = self._assess_comfort_level(temp, humidity, feels_like)

        profile = self._get_user_profile(user_id)
        advisories = self._generate_health_advisories(
            profile, temp, humidity, weather_text, wind_scale, uv_index, feels_like
        )
        recommendation = self._generate_activity_recommendation(
            temp, weather_text, current_hour, humidity, profile, feels_like, comfort
        )
        clothing = self._generate_clothing_recommendation(
            temp,
            feels_like,
            weather_text,
            wind_scale,
            humidity,
        )

        return {
            "weather": weather,
            "advisories": advisories,
            "recommendation": recommendation,
            "clothingAdvice": clothing,
            "comfortLevel": comfort,
            "comfortLabel": self._comfort_label(comfort),
            "timeBased": True,
            "source": weather.get("source", "unknown"),
        }

    def _generate_clothing_recommendation(self, temp, feels_like, weather_text, wind_scale, humidity):
        """根据温度、体感、天气状况生成穿衣建议"""
        effective_temp = feels_like if feels_like else temp
        parts = []

        if effective_temp >= 33:
            parts.append("👕 建议穿轻薄透气的短袖、宽松长裤，颜色浅一些更凉快")
        elif effective_temp >= 28:
            parts.append("👕 建议穿短袖或薄长袖，搭配透气休闲裤")
        elif effective_temp >= 23:
            parts.append("🧥 建议穿长袖衬衫或薄针织，可备一件轻便外套，方便早晚添减")
        elif effective_temp >= 16:
            parts.append("🧥 建议穿长袖内搭加薄外套或卫衣，采用「洋葱式」分层穿衣")
        elif effective_temp >= 8:
            parts.append("🧣 建议穿毛衣/厚外套，注意颈部和膝盖保暖，老人尤其要防受凉")
        else:
            parts.append("🧥 建议穿棉衣或羽绒服，戴帽子围巾，外出时间不宜过长")

        if "雨" in weather_text:
            parts.append("☔ 有降雨，请穿防滑鞋，外出携带雨具，路面湿滑放慢脚步")
        elif "雪" in weather_text:
            parts.append("❄️ 有降雪，穿防滑保暖鞋，注意脚下安全")

        if wind_scale >= 5:
            parts.append(f"💨 风力{wind_scale}级，建议加穿防风外套，避免着凉")
        elif wind_scale >= 3 and effective_temp < 20:
            parts.append("🌬️ 风较大，建议外套扣好或加一条围巾")

        if humidity >= 80 and effective_temp >= 28:
            parts.append("💧 湿度高、体感偏闷，选吸汗透气的棉质衣物，及时更换汗湿衣服")
        elif humidity >= 70 and effective_temp >= 24:
            parts.append("💧 湿度较高，建议穿透气吸汗的棉质衣物")
        elif humidity <= 35:
            parts.append("🌬️ 空气偏干燥，注意皮肤保湿，可适当带一件薄外套防温差")

        if "晴" in weather_text and effective_temp >= 25:
            parts.append("🧢 晴天紫外线较强，戴遮阳帽、太阳镜，长袖或涂防晒霜")

        return " ".join(parts) if parts else "🧥 今日气温适中，建议根据早晚温差准备一件可穿可脱的外套"

    def _generate_activity_recommendation(self, temp, weather_text, current_hour=None, humidity=60, profile=None, feels_like=None, comfort=None):
        """今日活动建议：侧重做什么运动、何时做、做多久，与穿衣/医疗提示分开"""
        if current_hour is None:
            current_hour = datetime.now().hour

        profile = profile or {}
        feels_like = feels_like if feels_like is not None else temp
        comfort = comfort or self._assess_comfort_level(temp, humidity, feels_like)
        chronic = profile.get("chronicDiseases") or []
        has_hypertension = any("高血压" in d or "血压" in d for d in chronic)
        has_joint = any("关节" in d or "风湿" in d for d in chronic)

        is_rainy = "雨" in weather_text or "雪" in weather_text
        is_outdoor_ok = not is_rainy and temp < 35

        if is_rainy:
            return (
                "🏠 今日有雨雪，建议在室内活动：原地踏步10-15分钟、"
                "伸展四肢或做八段锦，注意开窗通风"
            )

        if temp >= 35:
            return "🛋️ 高温不宜外出运动，可在室内做轻度伸展；若需活动，仅限清晨或夜间凉爽时段，每次不超过15分钟"

        if 11 <= current_hour < 15 and temp > 30:
            return "🛋️ 午后较热，建议室内休息；可在空调房内做坐位伸展或呼吸练习，避免剧烈运动"

        if 5 <= current_hour < 9 and is_outdoor_ok:
            if has_hypertension:
                return "🌅 清晨适合慢走15-20分钟，先喝半杯温水再出门，速度以能正常说话为宜，避免爬陡坡"
            return "🌅 晨练推荐：散步或太极拳15-20分钟，先热身5分钟，微微出汗即可"

        if 17 <= current_hour < 20 and is_outdoor_ok:
            if temp >= 30:
                return "🌆 傍晚仍偏热，可在小区阴凉处慢走15分钟，带上一瓶水，感觉累就休息"
            if has_joint:
                return "🌆 傍晚适合平地慢走15-20分钟，选择平坦路面，避免上下坡和台阶过多"
            return "🌆 傍晚是散步好时段：慢走20-30分钟，或打太极、做八段锦，运动前后记得拉伸"

        if comfort in ("muggy", "hot_muggy"):
            return "🚶 体感偏闷，可选清晨或傍晚各散步15-20分钟，避开中午；或在家做太极、弹力带练习"

        if temp >= 30:
            return "🌳 天气偏热，可选清晨或傍晚在阴凉处散步15-20分钟，避开11:00-15:00，及时补水"

        if comfort == "humid":
            return "🚶 湿度较高但气温适中，适合轻度活动：慢走20-30分钟，或在家做太极、八段锦"

        if temp >= 25:
            return "🚶 适合户外活动：推荐散步、太极或八段锦，每次20-30分钟，量力而行"

        if temp >= 18:
            return "🚶 天气舒适，可外出散步30分钟左右，或约家人一起慢走，注意运动后保暖"

        if temp >= 12:
            return "🧘 天气微凉，可在中午前后外出慢走15-20分钟，运动前充分热身，回家后及时添衣"

        return "🏠 天气较冷，建议以室内活动为主：原地踏步、伸展运动各10分钟，注意保暖"

    def check_weather_alerts(self, location=None):
        weather = self.fetch_weather(location)
        if not weather:
            return []

        alerts = []
        temp = int(float(weather.get("temp") or 25))
        humidity = int(float(weather.get("humidity") or 60))
        wind_scale = int(float(str(weather.get("windScale", "2")).split("-")[0] or 2))
        uv_index = int(float(weather.get("uvIndex") or 5))
        weather_text = weather.get("weather", "")

        if temp >= 38:
            alerts.append({
                "type": "weather_high_temp",
                "level": "danger",
                "message": f"高温红色预警！当前温度{temp}°C，请立即停止户外活动，保持室内通风降温",
                "value": temp,
                "unit": "°C",
                "timestamp": datetime.now().isoformat(),
            })
        elif temp >= 35:
            alerts.append({
                "type": "weather_high_temp",
                "level": "warning",
                "message": f"高温预警！当前温度{temp}°C，请减少户外活动时间",
                "value": temp,
                "unit": "°C",
                "timestamp": datetime.now().isoformat(),
            })

        if temp <= 5:
            alerts.append({
                "type": "weather_low_temp",
                "level": "warning",
                "message": f"低温预警！当前温度{temp}°C，请务必注意保暖",
                "value": temp,
                "unit": "°C",
                "timestamp": datetime.now().isoformat(),
            })

        if wind_scale >= 6:
            alerts.append({
                "type": "weather_strong_wind",
                "level": "warning",
                "message": f"大风预警！当前风力{wind_scale}级，请避免外出",
                "value": wind_scale,
                "unit": "级",
                "timestamp": datetime.now().isoformat(),
            })

        if "大雨" in weather_text or "暴雨" in weather_text:
            alerts.append({
                "type": "weather_heavy_rain",
                "level": "danger",
                "message": f"暴雨预警！{weather_text}，请避免外出，注意防涝",
                "value": weather_text,
                "unit": "",
                "timestamp": datetime.now().isoformat(),
            })

        if uv_index >= 8:
            alerts.append({
                "type": "weather_uv",
                "level": "warning",
                "message": f"紫外线强！UV指数{uv_index}，外出请做好防晒措施",
                "value": uv_index,
                "unit": "",
                "timestamp": datetime.now().isoformat(),
            })

        return alerts


weather_service = WeatherService()
