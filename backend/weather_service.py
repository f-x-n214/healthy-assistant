import requests
import json
import os
from datetime import datetime, timedelta

# 使用国家气象局官方API（中国天气网）
# 数据来源：国家气象信息中心 (http://www.nmc.cn/)
NMC_API_URL = "http://www.nmc.cn/rest/weather"
NMC_FORECAST_URL = "http://www.nmc.cn/rest/weather/forecast"

# 城市代码映射表（国家气象局标准）
CITY_CODES = {
    "101280101": {"name": "广州", "nmc_code": "59287"},
    "101010100": {"name": "北京", "nmc_code": "54511"},
    "101020100": {"name": "上海", "nmc_code": "58362"},
    "101210101": {"name": "杭州", "nmc_code": "58457"},
    "101230101": {"name": "福州", "nmc_code": "58847"},
    "101290101": {"name": "昆明", "nmc_code": "56778"},
    "101110101": {"name": "西安", "nmc_code": "57036"},
    "101190101": {"name": "南京", "nmc_code": "58238"},
    "101300101": {"name": "南宁", "nmc_code": "59431"},
    "101030101": {"name": "天津", "nmc_code": "54474"},
}

class WeatherService:
    def __init__(self, data_dir="data"):
        self.data_dir = data_dir
        self.cache_file = os.path.join(data_dir, "weather_cache.json")
        self.daily_file = os.path.join(data_dir, "daily_weather.json")
        self._ensure_dir()

    def _ensure_dir(self):
        if not os.path.exists(self.data_dir):
            os.makedirs(self.data_dir)

    def _get_cache(self):
        if os.path.exists(self.cache_file):
            try:
                with open(self.cache_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except:
                return {}
        return {}

    def _save_cache(self, data):
        with open(self.cache_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def _save_daily(self, data):
        daily_data = self._get_daily_data()
        today = datetime.now().strftime("%Y-%m-%d")
        daily_data[today] = data
        with open(self.daily_file, 'w', encoding='utf-8') as f:
            json.dump(daily_data, f, ensure_ascii=False, indent=2)

    def _get_daily_data(self):
        if os.path.exists(self.daily_file):
            try:
                with open(self.daily_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except:
                return {}
        return {}

    def fetch_weather(self, city="101280101"):
        """
        获取当前天气信息（使用国家气象局官方API）
        :param city: 城市ID，默认广州 101280101
        """
        cache = self._get_cache()
        now = datetime.now().timestamp()
        
        # 检查缓存是否有效（10分钟内）
        if cache.get('timestamp') and (now - cache['timestamp']) < 600:
            return cache.get('data', {})
        
        # 获取国家气象局城市代码
        city_info = CITY_CODES.get(city, {"name": "未知城市", "nmc_code": "59287"})
        
        try:
            # 使用国家气象局API
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "application/json"
            }
            response = requests.get(f"{NMC_API_URL}/{city_info['nmc_code']}", headers=headers, timeout=10)
            response.raise_for_status()
            result = response.json()
            
            if result and result.get('data'):
                data = result['data']
                weather_data = {
                    "temp": str(data.get('temperature', '25')),
                    "feelsLike": str(data.get('feelsLike', data.get('temperature', '25'))),
                    "weather": data.get('weather', '晴'),
                    "windDir": data.get('windDirection', '北风'),
                    "windScale": str(data.get('windPower', '2')),
                    "humidity": str(data.get('humidity', '60')),
                    "visibility": str(data.get('visibility', '10')),
                    "uvIndex": str(data.get('uvIndex', '3')),
                    "precip": str(data.get('precipitation', '0')),
                    "pressure": str(data.get('pressure', '1015')),
                    "updateTime": data.get('updateTime', datetime.now().isoformat()),
                    "city": result['location']['name']
                }
                
                cache_data = {
                    'timestamp': now,
                    'data': weather_data
                }
                self._save_cache(cache_data)
                self._save_daily(weather_data)
                
                return weather_data
            else:
                return self._generate_simulated_weather(city)
        except Exception as e:
            print(f"天气API调用失败，使用模拟数据: {e}")
            return self._generate_simulated_weather(city)

    def fetch_forecast(self, city="101280101"):
        """
        获取未来3天天气预报（使用国家气象局API）
        """
        city_info = CITY_CODES.get(city, {"name": "未知城市", "nmc_code": "59287"})
        
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "application/json"
            }
            response = requests.get(f"{NMC_FORECAST_URL}/{city_info['nmc_code']}", headers=headers, timeout=10)
            response.raise_for_status()
            result = response.json()
            
            if result and result.get('data') and result['data'].get('forecast'):
                forecasts = []
                for day in result['data']['forecast'][:3]:
                    forecasts.append({
                        "date": day.get('date', datetime.now().strftime("%Y-%m-%d")),
                        "dayWeather": day.get('dayWeather', '晴'),
                        "nightWeather": day.get('nightWeather', '晴'),
                        "highTemp": str(day.get('highTemp', '25')),
                        "lowTemp": str(day.get('lowTemp', '18')),
                        "windDir": day.get('windDirection', '北风'),
                        "windScale": str(day.get('windPower', '2')),
                        "precip": str(day.get('precipitation', '0')),
                        "uvIndex": str(day.get('uvIndex', '3'))
                    })
                return forecasts
        except Exception as e:
            print(f"天气预报API调用失败: {e}")
        
        return self._generate_simulated_forecast()

    def _generate_simulated_weather(self, city):
        """生成模拟天气数据（备用方案）"""
        import random
        weather_types = ["晴", "多云", "阴", "小雨", "中雨", "大雨", "雷阵雨"]
        
        city_info = {
            "101280101": {"name": "广州", "base_temp": 28, "humidity": 75},
            "101010100": {"name": "北京", "base_temp": 22, "humidity": 45},
            "101020100": {"name": "上海", "base_temp": 25, "humidity": 65},
            "101210101": {"name": "杭州", "base_temp": 24, "humidity": 70},
        }
        
        info = city_info.get(city, {"name": "未知城市", "base_temp": 25, "humidity": 60})
        
        now = datetime.now()
        hour = now.hour
        
        # 根据时间调整温度
        temp_offset = 0
        if 6 <= hour < 12:
            temp_offset = 3
        elif 12 <= hour < 18:
            temp_offset = 5
        elif 18 <= hour < 22:
            temp_offset = 2
        else:
            temp_offset = -3
        
        weather_data = {
            "temp": str(info['base_temp'] + temp_offset + random.randint(-2, 2)),
            "feelsLike": str(info['base_temp'] + temp_offset + random.randint(-3, 1)),
            "weather": random.choice(weather_types),
            "windDir": random.choice(["北风", "南风", "东风", "西风", "东北风", "西南风"]),
            "windScale": str(random.randint(1, 4)),
            "humidity": str(info['humidity'] + random.randint(-10, 10)),
            "visibility": str(random.randint(5, 15)),
            "uvIndex": str(random.randint(0, 10)),
            "precip": str(random.randint(0, 20)),
            "pressure": str(random.randint(1000, 1020)),
            "updateTime": now.isoformat(),
            "city": info['name']
        }
        
        self._save_cache({
            'timestamp': datetime.now().timestamp(),
            'data': weather_data
        })
        self._save_daily(weather_data)
        
        return weather_data

    def _generate_simulated_forecast(self):
        """生成模拟天气预报"""
        import random
        weather_types = ["晴", "多云", "阴", "小雨", "中雨", "大雨"]
        
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
                "precip": str(random.randint(0, 50)),
                "uvIndex": str(random.randint(0, 10))
            })
        
        return forecasts

    def _get_user_profile(self, user_id="default"):
        """获取用户健康档案"""
        profile_file = os.path.join(self.data_dir, f"{user_id}_profile.json")
        default_file = os.path.join(self.data_dir, "default_profile.json")
        
        try:
            if os.path.exists(profile_file):
                with open(profile_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            elif os.path.exists(default_file):
                with open(default_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
        except Exception as e:
            print(f"[天气服务] 获取用户档案失败: {e}")
        
        return {}

    def _get_personalized_advisories(self, profile, temp, humidity, weather_text):
        """基于用户健康档案生成个性化建议"""
        advisories = []
        chronic_diseases = profile.get('chronicDiseases', []) or []
        habits = profile.get('habits', {}) or {}
        exercise_habit = habits.get('exerciseHabit', '')
        
        # 高血压个性化建议
        has_hypertension = any('高血压' in disease or '血压' in disease for disease in chronic_diseases)
        if has_hypertension and temp > 30:
            advisories.append("❤️ 您有高血压记录，高温可能引起血压波动，建议午后测量血压")
        
        # 关节不适个性化建议
        has_joint_issue = any('关节' in disease or '风湿' in disease for disease in chronic_diseases)
        if has_joint_issue:
            if humidity > 80:
                advisories.append("🦴 您有关节不适记录，湿度高可能加重不适，建议减少长时间行走")
            elif "雨" in weather_text:
                advisories.append("🦴 您有关节不适记录，雨天关节不适风险增加，建议减少外出活动")
        
        # 糖尿病个性化建议
        has_diabetes = any('糖尿病' in disease or '血糖' in disease for disease in chronic_diseases)
        if has_diabetes and temp > 30:
            advisories.append("🩺 您有糖尿病记录，高温天气请注意补充水分，定时监测血糖")
        
        return advisories

    def get_health_advisory(self, user_id="default"):
        """根据天气情况生成健康建议"""
        weather = self.fetch_weather()
        if not weather:
            return None
        
        temp = int(weather.get('temp', 25))
        humidity = int(weather.get('humidity', 60))
        wind_scale = int(weather.get('windScale', 2))
        weather_text = weather.get('weather', '')
        uv_index = int(weather.get('uvIndex', 5))
        current_hour = datetime.now().hour
        
        advisories = []
        
        # 温度相关建议
        if temp >= 35:
            advisories.append(f"🔥 高温预警：当前温度{temp}°C，请注意防暑降温，避免中午外出")
        elif temp >= 32:
            advisories.append(f"🌞 天气炎热：当前温度{temp}°C，外出请做好防晒")
        elif temp <= 10:
            advisories.append(f"❄️ 天气寒冷：当前温度{temp}°C，请注意保暖")
        elif temp <= 15:
            advisories.append(f"🥶 气温较低：当前温度{temp}°C，建议增添衣物")
        
        # 湿度相关建议
        if humidity >= 85:
            advisories.append(f"💧 湿度较高：当前湿度{humidity}%，请注意防潮")
        elif humidity <= 30:
            advisories.append(f"🌬️ 空气干燥：当前湿度{humidity}%，建议多喝水")
        
        # 天气状况建议
        if "雨" in weather_text:
            advisories.append(f"🌧️ {weather_text}：外出请携带雨具，地面湿滑注意安全")
        elif weather_text == "晴":
            if uv_index >= 7:
                advisories.append(f"☀️ 晴天紫外线强（UV指数{uv_index}），外出请做好防晒")
        
        # 风力建议
        if wind_scale >= 5:
            advisories.append(f"💨 风力较大（{wind_scale}级），请注意防风")
        
        # 通用建议
        if temp >= 25 and humidity >= 60:
            advisories.append("🥵 闷热天气建议减少户外活动时间")
        
        # 获取用户健康档案，添加个性化建议
        profile = self._get_user_profile(user_id)
        personalized = self._get_personalized_advisories(profile, temp, humidity, weather_text)
        advisories.extend(personalized)
        
        # 获取活动建议（包含分时段建议）
        recommendation = self._generate_activity_recommendation(temp, weather_text, current_hour)
        
        return {
            "weather": weather,
            "advisories": advisories,
            "recommendation": recommendation,
            "timeBased": True  # 标识是否启用了分时段建议
        }

    def _generate_activity_recommendation(self, temp, weather_text, current_hour=None):
        """根据天气和时间生成活动建议"""
        if current_hour is None:
            current_hour = datetime.now().hour
        
        # 先判断天气是否适宜户外活动
        is_outdoor_suitable = not ("雨" in weather_text or "雪" in weather_text) and temp < 35
        
        # 分时段建议
        if 5 <= current_hour < 8:
            # 清晨5-8点：晨练建议
            if is_outdoor_suitable:
                return "🌅 晨练时间到了！晨练前请饮用半杯温水，避免空腹运动。适合散步或太极拳"
            else:
                return "🌅 现在是晨练时间，天气不太适合外出。可以在家做些室内伸展运动"
        
        elif 11 <= current_hour < 15 and temp > 30:
            # 中午11-15点且高温：午休建议
            return "☀️ 午后高温时段，建议室内休息，避免中暑。可开空调或电扇降温"
        
        elif 17 <= current_hour < 19:
            # 傍晚17-19点：傍晚活动建议
            if is_outdoor_suitable:
                return "🌆 傍晚适合散步，傍晚气温舒适，适合户外活动。需要设置17:00的散步提醒吗？"
            else:
                return "🌆 傍晚时间到！今天天气不太适合外出，建议在家做些轻度室内运动"
        
        # 非特定时段的通用建议
        if "雨" in weather_text or "雪" in weather_text:
            return "🌧️ 今日天气不适宜户外运动，建议室内活动或在家休息"
        
        if temp >= 35:
            return "☀️ 高温天气建议避免户外活动，可在清晨或傍晚凉爽时散步"
        elif temp >= 30:
            return "🔥 天气较热，建议选择阴凉处活动，注意补水"
        elif temp >= 25:
            return "🌤️ 天气适宜，建议进行适量户外活动如散步、太极"
        elif temp >= 18:
            return "🌿 天气舒适，适合外出活动"
        elif temp >= 12:
            return "🍃 天气微凉，外出建议增添衣物，可进行轻度运动"
        else:
            return "❄️ 天气较冷，建议减少户外活动，注意保暖"

    def check_weather_alerts(self):
        """检查天气异常并生成告警"""
        weather = self.fetch_weather()
        if not weather:
            return []
        
        alerts = []
        temp = int(weather.get('temp', 25))
        humidity = int(weather.get('humidity', 60))
        wind_scale = int(weather.get('windScale', 2))
        uv_index = int(weather.get('uvIndex', 5))
        weather_text = weather.get('weather', '')
        
        # 高温告警
        if temp >= 38:
            alerts.append({
                "type": "weather_high_temp",
                "level": "danger",
                "message": f"高温红色预警！当前温度{temp}°C，请立即停止户外活动，保持室内通风降温",
                "value": temp,
                "unit": "°C",
                "timestamp": datetime.now().isoformat()
            })
        elif temp >= 35:
            alerts.append({
                "type": "weather_high_temp",
                "level": "warning",
                "message": f"高温预警！当前温度{temp}°C，请减少户外活动时间",
                "value": temp,
                "unit": "°C",
                "timestamp": datetime.now().isoformat()
            })
        
        # 低温告警
        if temp <= 5:
            alerts.append({
                "type": "weather_low_temp",
                "level": "warning",
                "message": f"低温预警！当前温度{temp}°C，请务必注意保暖",
                "value": temp,
                "unit": "°C",
                "timestamp": datetime.now().isoformat()
            })
        
        # 大风告警
        if wind_scale >= 6:
            alerts.append({
                "type": "weather_strong_wind",
                "level": "warning",
                "message": f"大风预警！当前风力{wind_scale}级，请避免外出",
                "value": wind_scale,
                "unit": "级",
                "timestamp": datetime.now().isoformat()
            })
        
        # 暴雨告警
        if "大雨" in weather_text or "暴雨" in weather_text:
            alerts.append({
                "type": "weather_heavy_rain",
                "level": "danger",
                "message": f"暴雨预警！{weather_text}，请避免外出，注意防涝",
                "value": weather_text,
                "unit": "",
                "timestamp": datetime.now().isoformat()
            })
        
        # 强紫外线告警
        if uv_index >= 8:
            alerts.append({
                "type": "weather_uv",
                "level": "warning",
                "message": f"紫外线强！UV指数{uv_index}，外出请做好防晒措施",
                "value": uv_index,
                "unit": "",
                "timestamp": datetime.now().isoformat()
            })
        
        return alerts

# 创建单例
weather_service = WeatherService()

if __name__ == "__main__":
    # 测试天气服务
    ws = WeatherService()
    print("当前天气：", ws.fetch_weather())
    print("未来3天预报：", ws.fetch_forecast())
    print("健康建议：", ws.get_health_advisory())
    print("天气告警：", ws.check_weather_alerts())