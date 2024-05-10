import axios from "axios";

const AxiosInstance = axios.create({
  timeout: 1000 * 60 * 5,
});

export default AxiosInstance;
